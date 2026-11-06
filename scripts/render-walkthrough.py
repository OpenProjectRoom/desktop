#!/usr/bin/env python3
"""Render the silent, captioned Project Room product walkthrough.

The setup illustrations are explanatory. App panels are crops of committed
Order Desk screenshots, never fabricated interaction recordings.
Requires Pillow and ffmpeg; no external media or fonts are downloaded.
"""

from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "assets" / "screenshots"
OUT = ROOT / "assets" / "demo"
FONT = "/System/Library/Fonts/Avenir Next.ttc"
MONO = "/System/Library/Fonts/Menlo.ttc"
W, H = 1280, 720
NAVY = "#102d3d"
INK = "#173848"
MUTED = "#5b7887"
TEAL = "#138a72"
PALE = "#edf6f7"
WHITE = "#ffffff"


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    index = {"bold": 0, "demi": 2, "medium": 5, "regular": 7}[weight]
    return ImageFont.truetype(FONT, size, index=index)


def mono(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(MONO, size)


def lines(draw: ImageDraw.ImageDraw, text: str, x: int, y: int,
          width: int, face: ImageFont.FreeTypeFont, fill: str,
          spacing: int = 9) -> int:
    for paragraph in text.split("\n"):
        words = paragraph.split()
        row = ""
        for word in words:
            candidate = (row + " " + word).strip()
            if row and draw.textbbox((0, 0), candidate, font=face)[2] > width:
                draw.text((x, y), row, font=face, fill=fill)
                y += face.size + spacing
                row = word
            else:
                row = candidate
        if row:
            draw.text((x, y), row, font=face, fill=fill)
            y += face.size + spacing
        if not words:
            y += face.size + spacing
    return y


def panel(image: Image.Image, box: tuple[int, int, int, int],
          radius: int = 24, shadow: int = 12, color: str = WHITE) -> None:
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", image.size)
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((x0, y0 + 7, x1, y1 + 7), radius=radius,
                        fill=(17, 53, 67, 28))
    layer = layer.filter(ImageFilter.GaussianBlur(shadow))
    image.alpha_composite(layer)
    ImageDraw.Draw(image).rounded_rectangle(box, radius=radius, fill=color,
                                           outline="#c8dfe4", width=2)


def badge(draw: ImageDraw.ImageDraw, text: str, x: int, y: int,
          color: str = TEAL, bg: str = "#dff4eb", size: int = 16) -> None:
    face = font(size, "demi")
    width = draw.textbbox((0, 0), text, font=face)[2]
    draw.rounded_rectangle((x, y, x + width + 28, y + size + 18),
                           radius=16, fill=bg)
    draw.text((x + 14, y + 8), text, font=face, fill=color)


def base(kicker: str, title: str, description: str, scene: int,
         total: int = 13) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (W, H), "#f2f8f9")
    d = ImageDraw.Draw(image)
    # Restrained grid echoes the website without covering the whole picture.
    for x in range(0, W, 56):
        d.line((x, 75, x, 216), fill="#dfecef", width=1)
    for y in range(75, 217, 56):
        d.line((0, y, W, y), fill="#dfecef", width=1)
    d.rectangle((0, 0, W, 75), fill=WHITE)
    d.line((0, 75, W, 75), fill="#d5e5e9", width=2)
    d.rounded_rectangle((64, 18, 102, 56), radius=9, fill=NAVY)
    d.line((75, 30, 91, 30), fill=WHITE, width=3)
    d.line((75, 44, 91, 44), fill=WHITE, width=3)
    d.ellipse((72, 26, 79, 33), fill="#9adaca")
    d.ellipse((88, 40, 95, 47), fill="#9adaca")
    d.text((116, 22), "Project Room", font=font(29, "bold"), fill=INK)
    d.text((1001, 32), "A REAL LOCAL PROJECT", font=font(14, "bold"),
           fill=MUTED, spacing=2)
    d.text((70, 132), kicker.upper(), font=font(17, "bold"), fill=TEAL)
    y = lines(d, title, 70, 175, 450, font(49, "bold"), INK, 2)
    lines(d, description, 72, y + 27, 420, font(25, "regular"), MUTED, 11)
    d.line((70, 659, 1210, 659), fill="#c8dce1", width=2)
    d.rounded_rectangle((70, 658, 70 + int(1140 * (scene + 1) / total), 661),
                        radius=2, fill=TEAL)
    d.text((70, 678), "PROJECT ROOM  /  ORDER DESK", font=font(14, "bold"), fill=MUTED)
    d.text((1150, 678), f"{scene + 1:02d} / {total:02d}",
           font=font(15, "bold"), fill=MUTED)
    return image, d


def real_capture(image: Image.Image, name: str,
                 crop: tuple[int, int, int, int],
                 label: str, sublabel: str = "") -> None:
    box = (536, 130, 1210, 622)
    panel(image, box, color="#1a2532")
    shot = Image.open(SHOTS / f"order-desk-{name}.png").convert("RGB")
    target = (650, 405)
    if name == "overview":
        view = Image.new("RGB", target, "#18212c")
        stats = shot.crop((287, 151, 905, 252)).resize((650, 107), Image.Resampling.LANCZOS)
        chart = shot.crop((287, 493, 1033, 809)).resize((650, 286), Image.Resampling.LANCZOS)
        view.paste(stats, (0, 0))
        view.paste(chart, (0, 119))
    else:
        view = shot.crop(crop)
        ratio = max(target[0] / view.width, target[1] / view.height)
        view = view.resize((math.ceil(view.width * ratio), math.ceil(view.height * ratio)),
                           Image.Resampling.LANCZOS)
        view = view.crop(((view.width - target[0]) // 2,
                          (view.height - target[1]) // 2,
                          (view.width + target[0]) // 2,
                          (view.height + target[1]) // 2))
    image.paste(view, (548, 164))
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((548, 569, 1198, 609), radius=9, fill="#203d4a")
    d.text((565, 575), label, font=font(19, "demi"), fill=WHITE)
    if sublabel:
        w = d.textbbox((0, 0), sublabel, font=font(15, "medium"))[2]
        d.text((1190 - w, 579), sublabel, font=font(15, "medium"), fill="#b6d5de")
    d.text((553, 142), "CAPTURED IN PROJECT ROOM", font=font(14, "bold"),
           fill="#a9cbd5")


def setup_panel(image: Image.Image, stage: int) -> None:
    panel(image, (536, 130, 1210, 622))
    d = ImageDraw.Draw(image)
    if stage == 0:
        d.rounded_rectangle((605, 196, 1142, 502), radius=22, fill="#e8f1f3", outline="#c7dce2", width=2)
        d.rounded_rectangle((638, 225, 1109, 461), radius=13, fill=NAVY)
        d.text((677, 259), "PROJECT ROOM", font=font(19, "bold"), fill="#a8ced7")
        d.text((677, 303), "Download free", font=font(43, "bold"), fill=WHITE)
        d.text((677, 359), "for Mac", font=font(43, "bold"), fill=WHITE)
        badge(d, "APPLE SILICON", 677, 419)
        d.line((588, 516, 1160, 516), fill="#7d9eaa", width=9)
        d.text((676, 551), "1  Download the Mac app", font=font(22, "demi"), fill=INK)
    elif stage == 1:
        d.rounded_rectangle((622, 173, 1135, 553), radius=20, fill="#e7f0f2", outline="#bcd3da", width=2)
        d.rectangle((622, 173, 1135, 224), fill="#dbe9ed")
        d.text((645, 188), "Project Room", font=font(20, "demi"), fill=INK)
        d.text((665, 256), "Open a workspace", font=font(35, "bold"), fill=INK)
        for y, title, hint in [(329, "Try working example", "Explore the included sample"),
                               (433, "Open project folder", "Choose your existing repository")]:
            d.rounded_rectangle((663, y, 1092, y + 85), radius=14, fill=WHITE, outline="#bdd4da", width=2)
            d.rounded_rectangle((681, y + 20, 726, y + 65), radius=11, fill="#e1f2ee")
            d.text((692, y + 26), "›", font=font(30, "bold"), fill=TEAL)
            d.text((745, y + 14), title, font=font(24, "demi"), fill=INK)
            d.text((745, y + 48), hint, font=font(16), fill=MUTED)
    elif stage in (2, 3):
        d.rounded_rectangle((560, 160, 830, 548), radius=18, fill="#e7f0f2", outline="#c4dae0", width=2)
        d.text((582, 182), "YOUR REPOSITORY", font=font(17, "bold"), fill=MUTED)
        for i, item in enumerate(["app/", "specs/", "tests/", "package.json"]):
            d.text((586, 238 + i * 62), "▱  " + item, font=font(24, "medium"), fill=INK)
        d.text((845, 325), "→", font=font(40, "medium"), fill=TEAL)
        d.rounded_rectangle((901, 191, 1184, 518), radius=18, fill="#eaf5f3", outline="#b3d7cf", width=2)
        d.text((922, 219), "CODING AGENT", font=font(17, "bold"), fill=TEAL)
        if stage == 2:
            d.text((922, 275), "Read-only", font=font(31, "bold"), fill=INK)
            d.text((922, 315), "project scan", font=font(31, "bold"), fill=INK)
            lines(d, "Find real services, tests, APIs and data.", 923, 380, 235, font(18), MUTED)
            badge(d, "REVIEW FIRST", 922, 459)
        else:
            d.text((922, 273), "You review", font=font(30, "bold"), fill=INK)
            d.text((922, 312), "the findings.", font=font(30, "bold"), fill=INK)
            lines(d, "Then the agent writes the verified config.", 923, 378, 235, font(18), MUTED)
            badge(d, "NO SECRET VALUES", 922, 459)
    else:
        d.rounded_rectangle((575, 188, 835, 538), radius=18, fill=NAVY)
        d.text((597, 219), ".projectroom/", font=mono(21), fill="#9cded2")
        d.text((597, 258), "project.yaml", font=mono(24), fill=WHITE)
        for i, row in enumerate(["services: 2", "tests: 1", "api: 1", "mcp: 1", "data: 1"]):
            d.text((601, 320 + i * 34), row, font=mono(18), fill="#d0e7e7")
        d.text((849, 330), "→", font=font(40), fill=TEAL)
        d.rounded_rectangle((917, 194, 1178, 530), radius=18, fill="#e9f4f5", outline="#bad9dd", width=2)
        d.text((938, 222), "PROJECT ROOM", font=font(16, "bold"), fill=MUTED)
        d.text((938, 274), "Your workspace", font=font(26, "bold"), fill=INK)
        for i, row in enumerate(["Services  2 ready", "Tests  1 suite", "API  1 found", "Data  1 source"]):
            d.rounded_rectangle((934, 330 + i * 42, 1154, 365 + i * 42), radius=8, fill=WHITE)
            d.text((946, 337 + i * 42), row, font=font(17, "demi"), fill=INK)


def scene(kicker: str, title: str, description: str, number: int,
          kind: str, **kwargs: object) -> Image.Image:
    image, d = base(kicker, title, description, number)
    if kind == "setup":
        setup_panel(image, int(kwargs["stage"]))
    elif kind == "capture":
        real_capture(image, str(kwargs["name"]), kwargs["crop"],
                     str(kwargs["label"]), str(kwargs.get("sublabel", "")))
    elif kind == "final":
        panel(image, (536, 130, 1210, 622), color=NAVY)
        d = ImageDraw.Draw(image)
        d.text((575, 183), "ONE WINDOW", font=font(22, "bold"), fill="#9bdacf")
        for i, row in enumerate(["Run your app", "Inspect APIs & MCP", "Check tests & data", "Follow the product plan"]):
            d.rounded_rectangle((575, 240 + i * 74, 1165, 295 + i * 74), radius=12,
                                fill="#244958")
            d.text((598, 249 + i * 74), "✓  " + row,
                   font=font(27, "demi"), fill=WHITE)
        badge(d, "FREE & OPEN SOURCE", 575, 561, color="#c7f1e5", bg="#236652")
    return image.convert("RGB")


SCENES = [
    (5, "Why Project Room", "Your agent builds the app. You keep the controls.",
     "A single view of the software behind your repository.", "final", {}),
    (6, "01 / DOWNLOAD", "Download the Mac app.",
     "Free and open source. Install it once on your Mac.", "setup", {"stage": 0}),
    (6, "02 / OPEN", "Open your project.",
     "Choose the repository you already use with your coding agent.", "setup", {"stage": 1}),
    (8, "03 / INSPECT", "Let your agent inspect the repo.",
     "It finds real services, tests, APIs and data. You review its findings first.",
     "setup", {"stage": 2}),
    (6, "04 / REVIEW", "Review what it found.",
     "Confirm the commands and connections before any configuration changes.",
     "setup", {"stage": 3}),
    (7, "05 / CONFIGURE", "Turn facts into a workspace.",
     "The agent writes a small, verified project.yaml. Your code and Spec Kit files stay where they are.",
     "setup", {"stage": 4}),
    (8, "06 / OVERVIEW", "Everything at a glance.",
     "Open the same folder in Project Room. See what is ready, running and passing.",
     "capture", {"name": "overview", "crop": (286, 145, 1035, 809),
                 "label": "2 services running  ·  1 recorded test run"}),
    (9, "07 / SERVICES", "Start it. Watch it.",
     "Start local services manually. See the build identity and memory history from this session.",
     "capture", {"name": "services", "crop": (286, 205, 1025, 734),
                 "label": "API & Web running  ·  79 MB memory"}),
    (8, "08 / MCP", "Try your own MCP tool.",
     "Inspect its arguments, run a tool deliberately, and see the real result.",
     "capture", {"name": "mcp", "crop": (845, 500, 1515, 980),
                 "label": "lookup_order  ·  result from PostgreSQL"}),
    (7, "09 / API", "Send a real request.",
     "Browse the OpenAPI operations and inspect the response in the same workspace.",
     "capture", {"name": "api", "crop": (870, 310, 1515, 785),
                 "label": "GET /health  →  200 OK"}),
    (8, "10 / TESTS", "Run a test. Read the output.",
     "Run the configured suite or a supported case, then see what actually passed.",
     "capture", {"name": "tests", "crop": (300, 207, 1375, 632),
                 "label": "PostgreSQL integration tests  ·  passed"}),
    (7, "11 / DATA", "Check the data behind it.",
     "Open a small, read-only preview of the orders in PostgreSQL.",
     "capture", {"name": "data", "crop": (754, 290, 1515, 850),
                 "label": "orders  ·  read-only preview"}),
    (6, "YOUR NEXT STEP", "Open your own project.",
     "Download free for Mac. Try the sample, then connect your repository.",
     "final", {}),
]


def main() -> None:
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is required")
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="project-room-film-") as temp:
        temp_path = Path(temp)
        paths = []
        for i, (_, kicker, title, description, kind, data) in enumerate(SCENES):
            image = scene(kicker, title, description, i, kind, **data)
            path = temp_path / f"scene-{i:02d}.png"
            image.save(path)
            paths.append(path)
            if i == 6:
                image.save(OUT / "project-room-from-repo-to-runtime-poster.png")
        transitions = 12
        sequence: list[tuple[Path, float]] = []
        for i, (path, (duration, *_rest)) in enumerate(zip(paths, SCENES)):
            sequence.append((path, duration - (transitions / 24 if i + 1 < len(paths) else 0)))
            if i + 1 < len(paths):
                before = Image.open(path).convert("RGB")
                after = Image.open(paths[i + 1]).convert("RGB")
                for frame in range(1, transitions + 1):
                    blended = Image.blend(before, after, frame / (transitions + 1))
                    transition_path = temp_path / f"transition-{i:02d}-{frame:02d}.png"
                    blended.save(transition_path)
                    sequence.append((transition_path, 1 / 24))
        listing = temp_path / "sequence.ffconcat"
        with listing.open("w") as stream:
            stream.write("ffconcat version 1.0\n")
            for path, duration in sequence:
                stream.write(f"file '{path}'\nduration {duration:.6f}\n")
            stream.write(f"file '{paths[-1]}'\n")
        target = OUT / "project-room-from-repo-to-runtime.mp4"
        args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-safe", "0", "-f", "concat", "-i", str(listing),
                "-vf", "fps=24,format=yuv420p", "-an", "-c:v", "libx264",
                "-preset", "medium", "-crf", "21",
                 "-pix_fmt", "yuv420p", "-t", str(sum(item[0] for item in SCENES)),
                 "-movflags", "+faststart", str(target)]
        subprocess.run(args, check=True)
        print(target)


if __name__ == "__main__":
    main()
