#!/usr/bin/env python3
"""
剧情一致性检查工具

用法：
    python consistency_checker.py <story_directory>

功能：
    1. 扫描故事目录中的所有章节文件
    2. 提取角色信息、时间线、地点等关键数据
    3. 检查前后一致性
    4. 生成检查报告

目录结构假设：
    story_directory/
    ├── outline.md          # 故事大纲
    ├── characters.md       # 角色设定
    ├── chapters/
    │   ├── chapter_001.md
    │   ├── chapter_002.md
    │   └── ...
    └── consistency_report.md  # 检查报告（输出）
"""

import os
import re
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Set, Optional
from datetime import datetime


@dataclass
class Character:
    """角色信息"""
    name: str
    aliases: List[str] = field(default_factory=list)
    age: Optional[int] = None
    gender: Optional[str] = None
    appearance: List[str] = field(default_factory=list)
    personality: List[str] = field(default_factory=list)
    abilities: List[str] = field(default_factory=list)
    first_mention: Optional[str] = None
    mentions: List[str] = field(default_factory=list)


@dataclass
class TimeEvent:
    """时间事件"""
    chapter: str
    content: str
    time_marker: Optional[str] = None


@dataclass
class Location:
    """地点信息"""
    name: str
    description: Optional[str] = None
    chapters: List[str] = field(default_factory=list)


@dataclass
class Foreshadowing:
    """伏笔"""
    content: str
    chapter_planted: str
    chapter_planned_resolve: Optional[str] = None
    chapter_actual_resolve: Optional[str] = None
    resolved: bool = False


@dataclass
class ConsistencyIssue:
    """一致性问题"""
    chapter: str
    issue_type: str  # character, time, location, plot, number
    severity: str  # high, medium, low
    description: str
    suggestion: str


class ConsistencyChecker:
    """一致性检查器"""

    def __init__(self, story_dir: str):
        self.story_dir = Path(story_dir)
        self.chapters_dir = self.story_dir / "chapters"
        self.characters: Dict[str, Character] = {}
        self.time_events: List[TimeEvent] = []
        self.locations: Dict[str, Location] = {}
        self.foreshadowing: List[Foreshadowing] = []
        self.issues: List[ConsistencyIssue] = []

    def check(self) -> List[ConsistencyIssue]:
        """执行一致性检查"""
        print(f"开始检查目录: {self.story_dir}")

        # 加载大纲和角色设定
        self._load_outline()
        self._load_characters()

        # 扫描所有章节
        chapters = self._scan_chapters()
        if not chapters:
            print("未找到章节文件")
            return []

        print(f"找到 {len(chapters)} 个章节文件")

        # 逐章检查
        for chapter_file in chapters:
            self._check_chapter(chapter_file)

        # 跨章节检查
        self._cross_chapter_checks()

        # 伏笔检查
        self._check_foreshadowing()

        return self.issues

    def _load_outline(self):
        """加载大纲文件"""
        outline_file = self.story_dir / "outline.md"
        if outline_file.exists():
            print(f"加载大纲: {outline_file}")
            # 这里可以添加大纲解析逻辑
        else:
            print("未找到大纲文件 (outline.md)")

    def _load_characters(self):
        """加载角色设定文件"""
        chars_file = self.story_dir / "characters.md"
        if chars_file.exists():
            print(f"加载角色设定: {chars_file}")
            content = chars_file.read_text(encoding="utf-8")
            self._parse_characters(content)
        else:
            print("未找到角色设定文件 (characters.md)")

    def _parse_characters(self, content: str):
        """解析角色设定"""
        # 简单解析：查找 ## 开头的角色名
        current_char = None
        for line in content.split("\n"):
            if line.startswith("## "):
                if current_char:
                    self.characters[current_char.name] = current_char
                name = line[3:].strip()
                current_char = Character(name=name)
            elif current_char and line.startswith("- 别名："):
                aliases = line[5:].strip().split("、")
                current_char.aliases = [a.strip() for a in aliases]
            elif current_char and line.startswith("- 年龄："):
                try:
                    current_char.age = int(line[5:].strip())
                except ValueError:
                    pass
            elif current_char and line.startswith("- 性别："):
                current_char.gender = line[5:].strip()

        if current_char:
            self.characters[current_char.name] = current_char

        print(f"加载了 {len(self.characters)} 个角色")

    def _scan_chapters(self) -> List[Path]:
        """扫描章节文件"""
        if not self.chapters_dir.exists():
            return []

        chapters = sorted(self.chapters_dir.glob("chapter_*.md"))
        return chapters

    def _check_chapter(self, chapter_file: Path):
        """检查单个章节"""
        chapter_name = chapter_file.stem
        content = chapter_file.read_text(encoding="utf-8")

        # 提取角色提及
        self._extract_character_mentions(chapter_name, content)

        # 提取时间信息
        self._extract_time_info(chapter_name, content)

        # 提取地点信息
        self._extract_locations(chapter_name, content)

        # 提取伏笔
        self._extract_foreshadowing(chapter_name, content)

        # 检查章节内部一致性
        self._check_chapter_internal(chapter_name, content)

    def _extract_character_mentions(self, chapter: str, content: str):
        """提取角色提及"""
        for name, char in self.characters.items():
            # 检查角色名和别名
            all_names = [name] + char.aliases
            for n in all_names:
                if n in content:
                    if not char.first_mention:
                        char.first_mention = chapter
                    if chapter not in char.mentions:
                        char.mentions.append(chapter)

    def _extract_time_info(self, chapter: str, content: str):
        """提取时间信息"""
        # 查找时间相关关键词
        time_patterns = [
            r"(\d+)年",
            r"(\d+)月",
            r"(\d+)天",
            r"(\d+)小时",
            r"早上|上午|中午|下午|傍晚|晚上",
            r"春天|夏天|秋天|冬天",
            r"一[周月年]后",
            r"几天后|几周后|几月后|几年后",
        ]

        for pattern in time_patterns:
            matches = re.findall(pattern, content)
            for match in matches:
                self.time_events.append(TimeEvent(
                    chapter=chapter,
                    content=match if isinstance(match, str) else str(match),
                    time_marker=pattern
                ))

    def _extract_locations(self, chapter: str, content: str):
        """提取地点信息"""
        # 查找地点相关关键词
        location_patterns = [
            r"在([^，。,.\n]{2,10})(?:的|里|外|上|下)",
            r"来到([^，。,.\n]{2,10})",
            r"到达([^，。,.\n]{2,10})",
            r"前往([^，。,.\n]{2,10})",
        ]

        for pattern in location_patterns:
            matches = re.findall(pattern, content)
            for match in matches:
                loc_name = match.strip()
                if loc_name not in self.locations:
                    self.locations[loc_name] = Location(name=loc_name)
                if chapter not in self.locations[loc_name].chapters:
                    self.locations[loc_name].chapters.append(chapter)

    def _extract_foreshadowing(self, chapter: str, content: str):
        """提取伏笔"""
        # 查找伏笔相关关键词
        foreshadow_patterns = [
            r"（伏笔：(.+?)）",
            r"<!-- 伏笔：(.+?) -->",
            r"【伏笔】(.+?)(?:\n|$)",
        ]

        for pattern in foreshadow_patterns:
            matches = re.findall(pattern, content)
            for match in matches:
                self.foreshadowing.append(Foreshadowing(
                    content=match.strip(),
                    chapter_planted=chapter
                ))

    def _check_chapter_internal(self, chapter: str, content: str):
        """检查章节内部一致性"""
        lines = content.split("\n")

        # 检查是否有空章节
        if len(lines) < 10:
            self.issues.append(ConsistencyIssue(
                chapter=chapter,
                issue_type="structure",
                severity="low",
                description="章节内容过短",
                suggestion="考虑增加更多细节或合并到其他章节"
            ))

        # 检查是否有未闭合的引号
        quote_count = content.count('"') + content.count('"')
        if quote_count % 2 != 0:
            self.issues.append(ConsistencyIssue(
                chapter=chapter,
                issue_type="format",
                severity="medium",
                description="引号未正确闭合",
                suggestion="检查对话引号是否成对"
            ))

    def _cross_chapter_checks(self):
        """跨章节一致性检查"""
        # 检查角色是否突然消失
        for name, char in self.characters.items():
            if char.mentions and len(char.mentions) > 3:
                # 检查是否有连续多章未出现
                for i in range(len(char.mentions) - 1):
                    curr = int(char.mentions[i].split("_")[-1]) if "_" in char.mentions[i] else 0
                    next_ch = int(char.mentions[i + 1].split("_")[-1]) if "_" in char.mentions[i + 1] else 0
                    if next_ch - curr > 5:
                        self.issues.append(ConsistencyIssue(
                            chapter=char.mentions[i],
                            issue_type="character",
                            severity="low",
                            description=f"角色 {name} 连续 {next_ch - curr} 章未出现",
                            suggestion="确认角色去向是否合理"
                        ))

    def _check_foreshadowing(self):
        """检查伏笔回收"""
        for fs in self.foreshadowing:
            if not fs.resolved:
                self.issues.append(ConsistencyIssue(
                    chapter=fs.chapter_planted,
                    issue_type="foreshadowing",
                    severity="medium",
                    description=f"伏笔未回收: {fs.content}",
                    suggestion="确认伏笔是否需要在后续章节回收"
                ))

    def generate_report(self, output_file: Optional[Path] = None):
        """生成检查报告"""
        if output_file is None:
            output_file = self.story_dir / "consistency_report.md"

        report = []
        report.append("# 一致性检查报告\n")
        report.append(f"**检查时间**: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        report.append(f"**检查范围**: {self.story_dir}\n")
        report.append(f"**章节数量**: {len(list(self.chapters_dir.glob('chapter_*.md'))) if self.chapters_dir.exists() else 0}\n")

        # 角色统计
        report.append("\n## 角色统计\n")
        report.append("| 角色 | 首次出现 | 出现章节 |\n")
        report.append("|------|----------|----------|\n")
        for name, char in self.characters.items():
            first = char.first_mention or "未知"
            count = len(char.mentions)
            report.append(f"| {name} | {first} | {count} 章 |\n")

        # 地点统计
        report.append("\n## 地点统计\n")
        report.append("| 地点 | 出现章节 |\n")
        report.append("|------|----------|\n")
        for name, loc in self.locations.items():
            count = len(loc.chapters)
            report.append(f"| {name} | {count} 章 |\n")

        # 伏笔状态
        if self.foreshadowing:
            report.append("\n## 伏笔状态\n")
            report.append("| 伏笔内容 | 埋下位置 | 状态 |\n")
            report.append("|----------|----------|------|\n")
            for fs in self.foreshadowing:
                status = "已回收" if fs.resolved else "待回收"
                report.append(f"| {fs.content} | {fs.chapter_planted} | {status} |\n")

        # 问题列表
        if self.issues:
            report.append("\n## 发现问题\n")
            report.append(f"共发现 {len(self.issues)} 个问题\n\n")

            # 按严重程度排序
            severity_order = {"high": 0, "medium": 1, "low": 2}
            sorted_issues = sorted(self.issues, key=lambda x: severity_order.get(x.severity, 3))

            for i, issue in enumerate(sorted_issues, 1):
                severity_icon = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(issue.severity, "⚪")
                report.append(f"### 问题 {i} {severity_icon}\n")
                report.append(f"- **章节**: {issue.chapter}\n")
                report.append(f"- **类型**: {issue.issue_type}\n")
                report.append(f"- **严重程度**: {issue.severity}\n")
                report.append(f"- **描述**: {issue.description}\n")
                report.append(f"- **建议**: {issue.suggestion}\n\n")
        else:
            report.append("\n## 检查结果\n")
            report.append("✅ 未发现一致性问题\n")

        # 写入文件
        report_content = "".join(report)
        output_file.write_text(report_content, encoding="utf-8")
        print(f"报告已生成: {output_file}")

        return report_content


def main():
    if len(sys.argv) < 2:
        print("用法: python consistency_checker.py <story_directory>")
        print("示例: python consistency_checker.py ./my_novel")
        sys.exit(1)

    story_dir = sys.argv[1]

    if not os.path.isdir(story_dir):
        print(f"错误: 目录不存在 - {story_dir}")
        sys.exit(1)

    checker = ConsistencyChecker(story_dir)
    issues = checker.check()

    # 生成报告
    report = checker.generate_report()

    # 打印摘要
    print("\n" + "=" * 50)
    print("检查完成!")
    print(f"发现问题: {len(issues)}")
    high_count = sum(1 for i in issues if i.severity == "high")
    medium_count = sum(1 for i in issues if i.severity == "medium")
    low_count = sum(1 for i in issues if i.severity == "low")
    print(f"  🔴 高严重度: {high_count}")
    print(f"  🟡 中严重度: {medium_count}")
    print(f"  🟢 低严重度: {low_count}")


if __name__ == "__main__":
    main()
