#!/usr/bin/env python3
"""
章节大纲生成工具

用法：
    python chapter_generator.py <outline_file> [--chapters N] [--start N]

功能：
    1. 读取故事大纲文件
    2. 根据大纲生成详细的章节大纲
    3. 输出结构化的章节规划

输入：
    outline_file: 故事大纲文件路径（Markdown格式）

输出：
    生成 chapters_outline.md 文件
"""

import argparse
import re
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Character:
    """角色信息"""
    name: str
    role: str  # protagonist, antagonist, supporting
    initial_status: str = ""
    final_status: str = ""


@dataclass
class PlotPoint:
    """剧情点"""
    chapter: int
    event: str
    type: str  # setup, conflict, climax, resolution
    characters: List[str] = field(default_factory=list)


@dataclass
class ChapterOutline:
    """章节大纲"""
    number: int
    title: str
    summary: str
    key_events: List[str]
    characters_involved: List[str]
    cliffhanger: str
    word_count_target: int = 2000


@dataclass
class Volume:
    """卷"""
    name: str
    chapters: List[ChapterOutline]
    theme: str
    main_conflict: str


class ChapterGenerator:
    """章节大纲生成器"""

    def __init__(self, outline_file: str):
        self.outline_file = Path(outline_file)
        self.title = ""
        self.synopsis = ""
        self.characters: List[Character] = []
        self.plot_points: List[PlotPoint] = []
        self.volumes: List[Volume] = []

    def parse_outline(self):
        """解析大纲文件"""
        if not self.outline_file.exists():
            print(f"错误: 大纲文件不存在 - {self.outline_file}")
            sys.exit(1)

        content = self.outline_file.read_text(encoding="utf-8")
        self._parse_title(content)
        self._parse_characters(content)
        self._parse_plot(content)

    def _parse_title(self, content: str):
        """解析标题和简介"""
        # 查找书名
        title_match = re.search(r"#\s*(.+?)(?:\n|$)", content)
        if title_match:
            self.title = title_match.group(1).strip()

        # 查找一句话概括
        synopsis_match = re.search(r"一句话概括[：:]\s*(.+?)(?:\n|$)", content)
        if synopsis_match:
            self.synopsis = synopsis_match.group(1).strip()

    def _parse_characters(self, content: str):
        """解析角色设定"""
        # 查找角色部分
        char_section = re.search(r"##\s*角色设定\n(.*?)(?=\n##|\Z)", content, re.DOTALL)
        if not char_section:
            return

        char_content = char_section.group(1)

        # 解析每个角色
        current_role = "supporting"
        for line in char_content.split("\n"):
            if "主角" in line:
                current_role = "protagonist"
            elif "反派" in line:
                current_role = "antagonist"
            elif line.startswith("### "):
                name = line[4:].strip()
                self.characters.append(Character(name=name, role=current_role))

    def _parse_plot(self, content: str):
        """解析剧情"""
        # 查找主线剧情部分
        plot_section = re.search(r"##\s*主线剧情\n(.*?)(?=\n##|\Z)", content, re.DOTALL)
        if not plot_section:
            return

        plot_content = plot_section.group(1)

        # 解析各阶段
        phase_pattern = r"###\s*(.+?)（(\d+)-(\d+)章）\n(.*?)(?=###|\Z)"
        for match in re.finditer(phase_pattern, plot_content, re.DOTALL):
            phase_name = match.group(1)
            start_ch = int(match.group(2))
            end_ch = int(match.group(3))
            phase_content = match.group(4)

            # 提取关键事件
            events = re.findall(r"-\s*(.+?)(?:\n|$)", phase_content)

            for i, event in enumerate(events):
                chapter = start_ch + i * (end_ch - start_ch) // len(events)
                self.plot_points.append(PlotPoint(
                    chapter=chapter,
                    event=event,
                    type=self._determine_event_type(phase_name)
                ))

    def _determine_event_type(self, phase_name: str) -> str:
        """根据阶段名确定事件类型"""
        if "起因" in phase_name or "开始" in phase_name:
            return "setup"
        elif "发展" in phase_name:
            return "development"
        elif "高潮" in phase_name:
            return "climax"
        elif "结局" in phase_name:
            return "resolution"
        return "development"

    def generate_chapters(self, num_chapters: int = 100, start_chapter: int = 1):
        """生成章节大纲"""
        chapters = []

        # 如果没有剧情点，生成默认剧情
        if not self.plot_points:
            self._generate_default_plot(num_chapters)

        # 按章节排序
        self.plot_points.sort(key=lambda x: x.chapter)

        # 生成每章大纲
        for i in range(num_chapters):
            ch_num = start_chapter + i
            ch = self._generate_single_chapter(ch_num, self.plot_points)
            chapters.append(ch)

        return chapters

    def _generate_default_plot(self, num_chapters: int):
        """生成默认剧情结构"""
        # 基本三幕结构
        act1_end = num_chapters // 4
        act2_end = num_chapters * 3 // 4

        self.plot_points = [
            PlotPoint(1, "故事开始，主角登场", "setup"),
            PlotPoint(act1_end // 2, "第一个冲突出现", "conflict"),
            PlotPoint(act1_end, "第一幕结束，主角做出关键决定", "turning_point"),
            PlotPoint(act1_end + (act2_end - act1_end) // 3, "主角面临更大挑战", "conflict"),
            PlotPoint(act2_end - (act2_end - act1_end) // 3, "高潮前的低谷", "crisis"),
            PlotPoint(act2_end, "最终对决开始", "climax"),
            PlotPoint(act2_end + (num_chapters - act2_end) // 2, "最终对决", "climax"),
            PlotPoint(num_chapters - 1, "故事收尾", "resolution"),
        ]

    def _generate_single_chapter(self, chapter_num: int, plot_points: List[PlotPoint]) -> ChapterOutline:
        """生成单章大纲"""
        # 找到当前章节相关的剧情点
        relevant_points = [p for p in plot_points if p.chapter == chapter_num]

        # 确定章节标题
        title = self._generate_chapter_title(chapter_num, relevant_points)

        # 确定章节摘要
        summary = self._generate_chapter_summary(chapter_num, relevant_points)

        # 确定关键事件
        key_events = [p.event for p in relevant_points] if relevant_points else [f"第{chapter_num}章主要事件"]

        # 确定涉及的角色
        characters = []
        for p in relevant_points:
            characters.extend(p.characters)
        if not characters:
            characters = [c.name for c in self.characters[:3]]

        # 生成悬念钩子
        cliffhanger = self._generate_cliffhanger(chapter_num, relevant_points)

        return ChapterOutline(
            number=chapter_num,
            title=title,
            summary=summary,
            key_events=key_events,
            characters_involved=characters,
            cliffhanger=cliffhanger
        )

    def _generate_chapter_title(self, chapter_num: int, plot_points: List[PlotPoint]) -> str:
        """生成章节标题"""
        if plot_points:
            # 使用第一个剧情点作为标题基础
            event = plot_points[0].event
            # 简化事件描述作为标题
            title = event[:10] if len(event) > 10 else event
            return f"第{chapter_num}章 {title}"
        else:
            return f"第{chapter_num}章"

    def _generate_chapter_summary(self, chapter_num: int, plot_points: List[PlotPoint]) -> str:
        """生成章节摘要"""
        if plot_points:
            return plot_points[0].event
        else:
            return f"第{chapter_num}章内容"

    def _generate_cliffhanger(self, chapter_num: int, plot_points: List[PlotPoint]) -> str:
        """生成悬念钩子"""
        # 根据章节位置选择钩子类型
        if not plot_points:
            return "事情出现了意想不到的转折..."

        event_type = plot_points[0].type

        cliffhangers = {
            "setup": "然而，这只是开始...",
            "conflict": "就在这一刻，他意识到了一个惊人的真相...",
            "development": "但他不知道的是，更大的危机正在逼近...",
            "climax": "胜负，在此一举！",
            "crisis": "所有的努力，难道都要化为泡影吗？",
            "turning_point": "这个决定，将改变一切...",
            "resolution": "故事，还远没有结束...",
        }

        return cliffhangers.get(event_type, "事情出现了意想不到的转折...")

    def generate_volume_structure(self, chapters: List[ChapterOutline], chapters_per_volume: int = 50) -> List[Volume]:
        """生成卷结构"""
        volumes = []

        for i in range(0, len(chapters), chapters_per_volume):
            vol_chapters = chapters[i:i + chapters_per_volume]
            vol_num = len(volumes) + 1

            volume = Volume(
                name=f"第{vol_num}卷",
                chapters=vol_chapters,
                theme=f"第{vol_num}卷主题",
                main_conflict=f"第{vol_num}卷主要冲突"
            )
            volumes.append(volume)

        return volumes

    def output_chapters(self, chapters: List[ChapterOutline], output_file: Optional[Path] = None):
        """输出章节大纲"""
        if output_file is None:
            output_file = self.outline_file.parent / "chapters_outline.md"

        lines = []
        lines.append(f"# 《{self.title}》章节大纲\n")
        lines.append(f"**故事简介**: {self.synopsis}\n")
        lines.append(f"**总章数**: {len(chapters)}\n")

        # 按卷分组输出
        volumes = self.generate_volume_structure(chapters)

        for vol in volumes:
            lines.append(f"\n## {vol.name}\n")
            lines.append(f"**主题**: {vol.theme}\n")
            lines.append(f"**主要冲突**: {vol.main_conflict}\n\n")

            for ch in vol.chapters:
                lines.append(f"### {ch.title}\n")
                lines.append(f"**摘要**: {ch.summary}\n")
                lines.append(f"**关键事件**:\n")
                for event in ch.key_events:
                    lines.append(f"- {event}\n")
                lines.append(f"**涉及角色**: {', '.join(ch.characters_involved)}\n")
                lines.append(f"**悬念钩子**: {ch.cliffhanger}\n")
                lines.append(f"**目标字数**: {ch.word_count_target}\n\n")

        content = "".join(lines)
        output_file.write_text(content, encoding="utf-8")
        print(f"章节大纲已生成: {output_file}")

        return content


def main():
    parser = argparse.ArgumentParser(description="章节大纲生成工具")
    parser.add_argument("outline_file", help="故事大纲文件路径")
    parser.add_argument("--chapters", type=int, default=100, help="生成章节数量 (默认: 100)")
    parser.add_argument("--start", type=int, default=1, help="起始章节号 (默认: 1)")

    args = parser.parse_args()

    generator = ChapterGenerator(args.outline_file)
    generator.parse_outline()

    chapters = generator.generate_chapters(args.chapters, args.start)
    generator.output_chapters(chapters)

    print(f"\n生成完成!")
    print(f"- 书名: {generator.title}")
    print(f"- 章节数: {len(chapters)}")
    print(f"- 角色数: {len(generator.characters)}")


if __name__ == "__main__":
    main()
