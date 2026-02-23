from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import httpx
from youtube_transcript_api import YouTubeTranscriptApi


@dataclass
class TranscriptExtractionResult:
    video_id: str
    transcript: str
    title: str
    thumbnail_url: str
    channel_title: str = ""
    used_title_fallback: bool = False


class TranscriptService:
    @staticmethod
    def _normalize_title_candidate(title: str) -> str:
        cleaned = TranscriptService._clean_text(title).replace(" - YouTube", "").strip(" -")
        lowered = cleaned.lower()
        if not cleaned or lowered in {"youtube", "home", "watch", "video"}:
            return ""
        return cleaned

    @staticmethod
    def _extract_video_id(youtube_url: str) -> str:
        parsed = urlparse(youtube_url)
        host = (parsed.hostname or "").lower()

        if host in {"youtu.be", "www.youtu.be"}:
            video_id = parsed.path.strip("/")
            if video_id:
                return video_id

        if "youtube.com" in host:
            if parsed.path == "/watch":
                video_id = parse_qs(parsed.query).get("v", [""])[0]
                if video_id:
                    return video_id
            if parsed.path.startswith("/shorts/") or parsed.path.startswith("/embed/"):
                parts = parsed.path.strip("/").split("/")
                if len(parts) > 1:
                    return parts[1]

        match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)", youtube_url)
        if match:
            return match.group(1)

        raise ValueError("Invalid YouTube URL. Could not extract video ID.")

    @staticmethod
    def _clean_text(text: str) -> str:
        text = html.unescape(text)
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @staticmethod
    def _extract_with_library(video_id: str, language: str | None = None) -> str:
        try:
            if language:
                transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=[language])
            else:
                transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US", "en-GB"])
        except Exception:
            return ""

        text = " ".join(chunk.get("text", "") for chunk in transcript)
        return TranscriptService._clean_text(text)

    @staticmethod
    def _extract_json_after_marker(content: str, marker: str) -> str | None:
        marker_index = content.find(marker)
        if marker_index == -1:
            return None

        start = content.find("{", marker_index)
        if start == -1:
            return None

        depth = 0
        in_string = False
        escaped = False

        for i in range(start, len(content)):
            char = content[i]

            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return content[start : i + 1]

        return None

    @staticmethod
    def _extract_player_response(html_content: str) -> dict | None:
        markers = [
            "ytInitialPlayerResponse = ",
            "var ytInitialPlayerResponse = ",
            "window['ytInitialPlayerResponse'] = ",
        ]

        for marker in markers:
            payload = TranscriptService._extract_json_after_marker(html_content, marker)
            if not payload:
                continue
            try:
                return json.loads(payload)
            except json.JSONDecodeError:
                continue

        return None

    @staticmethod
    def _extract_meta_tag(html_content: str, property_name: str) -> str:
        pattern = rf'<meta[^>]+property=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']'
        match = re.search(pattern, html_content, flags=re.IGNORECASE)
        return TranscriptService._clean_text(match.group(1)) if match else ""

    @staticmethod
    def _extract_title_from_html(html_content: str) -> str:
        title = TranscriptService._extract_meta_tag(html_content, "og:title")
        if title:
            return TranscriptService._normalize_title_candidate(title)

        match = re.search(r"<title>(.*?)</title>", html_content, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            return ""

        return TranscriptService._normalize_title_candidate(match.group(1))

    @staticmethod
    def _metadata_from_player_response(video_id: str, player_response: dict | None) -> dict[str, str]:
        if not player_response:
            return {
                "title": "",
                "thumbnail_url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "channel_title": "",
                "description": "",
            }

        video_details = player_response.get("videoDetails", {})
        thumbnails = video_details.get("thumbnail", {}).get("thumbnails", [])
        thumbnail_url = thumbnails[-1].get("url", "") if thumbnails else ""

        return {
            "title": TranscriptService._normalize_title_candidate(str(video_details.get("title", ""))),
            "thumbnail_url": thumbnail_url or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "channel_title": TranscriptService._clean_text(str(video_details.get("author", ""))),
            "description": TranscriptService._clean_text(str(video_details.get("shortDescription", ""))),
        }

    @staticmethod
    def _merge_metadata(base: dict[str, str], extra: dict[str, str]) -> dict[str, str]:
        merged = dict(base)
        for key, value in extra.items():
            if value and not merged.get(key):
                merged[key] = value

        if not merged.get("thumbnail_url") and merged.get("video_id"):
            merged["thumbnail_url"] = f"https://i.ytimg.com/vi/{merged['video_id']}/hqdefault.jpg"
        return merged

    async def _fetch_video_meta(self, video_id: str) -> dict[str, str]:
        watch_url = f"https://www.youtube.com/watch?v={video_id}"
        default_meta = {
            "title": f"YouTube Lecture ({video_id})",
            "thumbnail_url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "channel_title": "",
            "description": "",
        }

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept-Language": "en-US,en;q=0.9",
        }

        async with httpx.AsyncClient(timeout=20) as client:
            # Fast metadata path.
            try:
                oembed_resp = await client.get(
                    "https://www.youtube.com/oembed",
                    params={"url": watch_url, "format": "json"},
                    headers=headers,
                )
                if oembed_resp.is_success:
                    data = oembed_resp.json()
                    title = self._normalize_title_candidate(str(data.get("title", "")))
                    channel_title = self._clean_text(str(data.get("author_name", "")))
                    thumbnail_url = str(data.get("thumbnail_url", "")).strip()
                    if title:
                        default_meta["title"] = title
                    if thumbnail_url:
                        default_meta["thumbnail_url"] = thumbnail_url
                    if channel_title:
                        default_meta["channel_title"] = channel_title
            except Exception:
                pass

            # Rich metadata path from watch page.
            try:
                watch_resp = await client.get(watch_url, headers=headers)
                watch_resp.raise_for_status()
                html_content = watch_resp.text
            except Exception:
                return default_meta

        player_response = self._extract_player_response(html_content)
        player_meta = self._metadata_from_player_response(video_id, player_response)
        merged = self._merge_metadata(default_meta, player_meta)

        html_title = self._extract_title_from_html(html_content)
        html_thumbnail = self._extract_meta_tag(html_content, "og:image")
        html_description = self._extract_meta_tag(html_content, "og:description")

        if html_title and merged.get("title", "").startswith("YouTube Lecture"):
            merged["title"] = html_title
        if html_thumbnail and not merged.get("thumbnail_url"):
            merged["thumbnail_url"] = html_thumbnail
        if html_description and not merged.get("description"):
            merged["description"] = html_description

        return merged

    @staticmethod
    def _select_caption_track(caption_tracks: list[dict], language: str | None = None) -> dict | None:
        if not caption_tracks:
            return None

        if language:
            wanted = language.lower()
            for track in caption_tracks:
                if track.get("languageCode", "").lower().startswith(wanted):
                    return track

        for track in caption_tracks:
            if track.get("languageCode", "").lower().startswith("en"):
                return track

        return caption_tracks[0]

    @staticmethod
    def _parse_vtt_or_xml(caption_payload: str) -> str:
        if "WEBVTT" in caption_payload:
            lines: list[str] = []
            for raw_line in caption_payload.splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                if line.startswith("WEBVTT") or line.startswith("Kind:") or line.startswith("Language:"):
                    continue
                if "-->" in line:
                    continue
                if line.isdigit():
                    continue
                lines.append(line)
            return TranscriptService._clean_text(" ".join(lines))

        xml_chunks = re.findall(r"<text[^>]*>(.*?)</text>", caption_payload, flags=re.DOTALL)
        if not xml_chunks:
            return ""

        merged = " ".join(chunk for chunk in xml_chunks)
        return TranscriptService._clean_text(merged)

    async def _extract_with_fallback(
        self,
        video_id: str,
        language: str | None = None,
    ) -> tuple[str, dict[str, str]]:
        watch_url = f"https://www.youtube.com/watch?v={video_id}"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept-Language": "en-US,en;q=0.9",
        }

        async with httpx.AsyncClient(timeout=20) as client:
            watch_resp = await client.get(watch_url, headers=headers)
            watch_resp.raise_for_status()
            html_content = watch_resp.text

            player_response = self._extract_player_response(html_content)
            metadata = self._metadata_from_player_response(video_id=video_id, player_response=player_response)

            if not player_response:
                return "", metadata

            caption_tracks = (
                player_response.get("captions", {})
                .get("playerCaptionsTracklistRenderer", {})
                .get("captionTracks", [])
            )

            selected_track = self._select_caption_track(caption_tracks, language)
            if not selected_track:
                return "", metadata

            base_url = selected_track.get("baseUrl")
            if not base_url:
                return "", metadata

            caption_resp = await client.get(base_url + "&fmt=vtt")
            caption_resp.raise_for_status()
            transcript = self._parse_vtt_or_xml(caption_resp.text)
            if transcript:
                return transcript, metadata

            xml_resp = await client.get(base_url)
            xml_resp.raise_for_status()
            return self._parse_vtt_or_xml(xml_resp.text), metadata

    @staticmethod
    def _build_title_fallback_text(metadata: dict[str, str]) -> str:
        title = metadata.get("title", "Untitled lecture")
        channel = metadata.get("channel_title", "")
        description = metadata.get("description", "")

        lines = [
            f"Lecture topic title: {title}.",
            "Transcript could not be extracted from this video.",
            "Generate structured academic notes based on the title and probable lecture scope.",
            "Include key definitions, core concepts, important examples, and exam revision points.",
        ]

        if channel:
            lines.append(f"Channel: {channel}.")

        if description:
            trimmed_description = description[:1400]
            lines.append(f"Video description context: {trimmed_description}")

        return "\n".join(lines)

    async def get_video_meta(self, youtube_url: str) -> dict[str, str]:
        video_id = self._extract_video_id(youtube_url)
        metadata = await self._fetch_video_meta(video_id)
        metadata["video_id"] = video_id
        return metadata

    async def extract(self, youtube_url: str, language: str | None = None) -> TranscriptExtractionResult:
        video_id = self._extract_video_id(youtube_url)
        metadata = await self._fetch_video_meta(video_id)
        metadata["video_id"] = video_id

        transcript = self._extract_with_library(video_id=video_id, language=language)
        used_title_fallback = False

        if not transcript:
            fallback_transcript, fallback_meta = await self._extract_with_fallback(video_id=video_id, language=language)
            metadata = self._merge_metadata(metadata, fallback_meta)
            transcript = fallback_transcript

        if not transcript:
            used_title_fallback = True
            transcript = self._build_title_fallback_text(metadata)

        if len(transcript.strip()) < 10:
            transcript = (
                transcript.strip()
                + "\nThis lecture likely introduces foundational concepts and revision-oriented ideas."
            )

        return TranscriptExtractionResult(
            video_id=video_id,
            transcript=transcript,
            title=metadata.get("title", f"YouTube Lecture ({video_id})"),
            thumbnail_url=metadata.get("thumbnail_url", f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
            channel_title=metadata.get("channel_title", ""),
            used_title_fallback=used_title_fallback,
        )
