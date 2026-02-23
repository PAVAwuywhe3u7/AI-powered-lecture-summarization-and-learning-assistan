from __future__ import annotations

from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.models.schemas import MCQItem, StructuredSummary


class PDFService:
    @staticmethod
    def _section(story: list, title: str, items: list[str], styles: dict) -> None:
        story.append(Paragraph(title, styles["section"]))
        if not items:
            story.append(Paragraph("No content generated.", styles["body"]))
            story.append(Spacer(1, 0.2 * cm))
            return

        for item in items:
            story.append(Paragraph(f"- {item}", styles["body"]))
            story.append(Spacer(1, 0.15 * cm))
        story.append(Spacer(1, 0.2 * cm))

    def build(self, summary: StructuredSummary, mcqs: list[MCQItem]) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1.8 * cm,
            leftMargin=1.8 * cm,
            topMargin=1.6 * cm,
            bottomMargin=1.6 * cm,
            title="Edu Simplify Notes",
        )

        base_styles = getSampleStyleSheet()
        styles = {
            "title": ParagraphStyle(
                "Title",
                parent=base_styles["Title"],
                fontSize=20,
                textColor=colors.HexColor("#0F172A"),
                spaceAfter=10,
            ),
            "meta": ParagraphStyle(
                "Meta",
                parent=base_styles["Normal"],
                fontSize=9,
                textColor=colors.HexColor("#475569"),
                spaceAfter=12,
            ),
            "section": ParagraphStyle(
                "Section",
                parent=base_styles["Heading2"],
                fontSize=13,
                textColor=colors.HexColor("#1E293B"),
                spaceAfter=5,
            ),
            "body": ParagraphStyle(
                "Body",
                parent=base_styles["Normal"],
                fontSize=10.5,
                leading=14,
                textColor=colors.HexColor("#0F172A"),
            ),
        }

        story: list = []
        story.append(Paragraph("Edu Simplify Study Notes", styles["title"]))
        story.append(Paragraph(datetime.now().strftime("Generated on %Y-%m-%d %H:%M"), styles["meta"]))

        self._section(story, "3-Paragraph Lecture Synthesis", summary.overview_paragraphs, styles)
        self._section(story, "Key Definitions", summary.key_definitions, styles)
        self._section(story, "Core Concepts", summary.core_concepts, styles)
        self._section(story, "Important Examples", summary.important_examples, styles)
        self._section(story, "Exam Revision Points", summary.exam_revision_points, styles)

        story.append(Spacer(1, 0.3 * cm))
        story.append(Paragraph("MCQ Practice", styles["section"]))

        if not mcqs:
            story.append(Paragraph("No MCQs generated yet.", styles["body"]))
        else:
            option_labels = ["A", "B", "C", "D"]
            for index, mcq in enumerate(mcqs, start=1):
                story.append(Paragraph(f"Q{index}. {mcq.question}", styles["body"]))
                for opt_index, option in enumerate(mcq.options):
                    story.append(Paragraph(f"{option_labels[opt_index]}. {option}", styles["body"]))
                story.append(
                    Paragraph(
                        f"Correct: {option_labels[mcq.correct_index]}. {mcq.options[mcq.correct_index]}",
                        styles["body"],
                    )
                )
                story.append(Paragraph(f"Explanation: {mcq.explanation}", styles["body"]))
                story.append(Spacer(1, 0.25 * cm))

        doc.build(story)
        return buffer.getvalue()
