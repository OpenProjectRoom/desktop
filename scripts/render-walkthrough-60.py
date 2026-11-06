#!/usr/bin/env python3
"""Render the 60-second silent Project Room film from real Order Desk captures.

Setup scenes and the pointer/focus transitions are illustrations. App screens
are captured states, not a claim that the video records unattended actions.
"""

from __future__ import annotations

import argparse
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "assets/screenshots"
OUT = ROOT / "assets/demo"
FONT_DIR = ROOT / "assets/demo/fonts"
W, H, FPS = 1280, 720, 18
BG = "#0d2331"
PANEL = "#1a3342"
LINE = "#3b6677"
TEXT = "#f0f8f9"
MUTED = "#a9c6d1"
TEAL = "#83dcc3"
GOLD = "#f2bf85"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    filename = "manrope-700.ttf" if bold else "dm-sans-400.ttf"
    return ImageFont.truetype(str(FONT_DIR / filename), size)


F_SMALL = font(18)
F_LABEL = font(20, True)
F_BODY = font(24)
F_HEAD = font(46, True)
F_BIG = font(73, True)


@dataclass(frozen=True)
class Scene:
    seconds: int
    title: str
    kind: str
    image: str = ""
    crop: tuple[int, int, int, int] = (0, 0, 0, 0)
    end_crop: tuple[int, int, int, int] | None = None


SCENES = [
    Scene(3, "Your agent writes the code. You keep control.", "intro"),
    Scene(4, "Download the free Mac app.", "download"),
    Scene(4, "Open your existing repository.", "open"),
    Scene(5, "Review what your coding agent finds.", "configure"),
    Scene(5, "Your workspace comes into view.", "capture", "overview", (270, 50, 1518, 840), (285, 145, 1215, 735)),
    Scene(4, "See the services and data behind it.", "capture", "project-map", (285, 155, 1515, 725), (475, 240, 1275, 615)),
    Scene(7, "Start a service. See it go live.", "service", "services", (285, 85, 1165, 450)),
    Scene(5, "Watch CPU and memory while it runs.", "capture", "services", (285, 355, 1515, 860), (290, 435, 1510, 940)),
    Scene(5, "Run your own MCP tool.", "capture", "mcp", (850, 500, 1515, 775), (850, 685, 1515, 960)),
    Scene(5, "Send an API request. Read the response.", "capture", "api", (535, 309, 1515, 787), (875, 320, 1500, 735)),
    Scene(4, "Inspect real data in place.", "capture", "data", (755, 275, 1515, 870), (765, 325, 1510, 770)),
    Scene(6, "Run the tests. See what passed.", "capture", "tests", (285, 143, 1390, 633), (285, 245, 1350, 685)),
    Scene(3, "One window. Your whole local stack.", "outro"),
]
assert sum(scene.seconds for scene in SCENES) == 60

IMAGES = {name: Image.open(SHOTS / f"order-desk-{name}.png").convert("RGB")
          for name in {s.image for s in SCENES if s.image}}
BEFORE = Image.open(SHOTS / "order-desk-services-before.png").convert("RGB")
AFTER = Image.open(SHOTS / "order-desk-services-after.png").convert("RGB")


def ease(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def rect(draw: ImageDraw.ImageDraw, box, fill, outline=None, radius=18, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_base(index: int, local: float, scene: Scene) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 64):
        d.line((x, 0, x, H), fill="#183747", width=1)
    for y in range(0, H, 64):
        d.line((0, y, W, y), fill="#183747", width=1)
    d.rectangle((0, 0, W, 102), fill="#102c3b")
    d.text((65, 27), "PROJECT ROOM", font=F_LABEL, fill=TEXT)
    d.text((1044, 29), "ORDER DESK" if scene.kind in {"capture", "service"} else "HOW IT WORKS",
           font=F_SMALL, fill=MUTED)
    d.line((65, 88, 1215, 88), fill=LINE, width=2)
    d.text((65, 111), scene.title, font=F_HEAD, fill=TEXT)
    d.line((65, 666, 1215, 666), fill=LINE, width=2)
    elapsed = sum(s.seconds for s in SCENES[:index]) + local
    d.rounded_rectangle((65, 665, 65 + int(1150 * elapsed / 60), 669), radius=2, fill=TEAL)
    d.text((66, 684), "REAL APP SCREENS · SETUP ILLUSTRATED", font=F_SMALL, fill=MUTED)
    d.text((1154, 684), f"{int(elapsed):02d}/60", font=F_SMALL, fill=MUTED)
    return im


def crop_frame(source: Image.Image, bounds, end_bounds, phase: float) -> Image.Image:
    if end_bounds:
        p = ease(phase)
        bounds = tuple(round(a + (b - a) * p) for a, b in zip(bounds, end_bounds))
    result = source.crop(bounds)
    return ImageOps.fit(result, (1110, 460), Image.Resampling.LANCZOS,
                        centering=(0.5, 0.48))


def app_frame(im: Image.Image, source: Image.Image, bounds, end_bounds, phase: float):
    d = ImageDraw.Draw(im)
    rect(d, (76, 183, 1204, 653), "#142d3a", outline=LINE, radius=22)
    image = crop_frame(source, bounds, end_bounds, phase)
    im.paste(image, (85, 188))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((84, 187, 1196, 649), radius=15, outline="#6e9aaa", width=2)


def focus(im: Image.Image, box, local: float, start: float = 0.5):
    if local < start:
        return
    d = ImageDraw.Draw(im)
    strength = (math.sin((local - start) * math.pi * 1.3) + 1) / 2
    r = 3 + round(strength * 2)
    d.rounded_rectangle(box, radius=12, outline=TEAL, width=r)


def setup_card(d, x, y, w, h, title, subtitle, active=False):
    rect(d, (x, y, x + w, y + h), "#1c4050" if active else PANEL,
         outline=TEAL if active else LINE, radius=20, width=3 if active else 2)
    heading_size = 28 if h < 150 else 34
    d.text((x + 28, y + (18 if h < 150 else 26)), title,
           font=font(heading_size, True), fill=TEXT)
    d.text((x + 29, y + (66 if h < 150 else 86)), subtitle,
           font=F_SMALL if h < 150 else F_BODY, fill=MUTED)


def draw_setup(im: Image.Image, kind: str, local: float):
    d = ImageDraw.Draw(im)
    if kind == "intro":
        setup_card(d, 85, 234, 327, 256, "CODING AGENT", "Codex · Claude · Cursor", True)
        setup_card(d, 476, 234, 327, 256, "SAME REPO", "Code · specs · config", local > 0.8)
        setup_card(d, 867, 234, 327, 256, "PROJECT ROOM", "Run · inspect · verify", local > 1.6)
        for x in (424, 815):
            d.text((x, 320), "→", font=F_BIG, fill=TEAL)
    elif kind == "download":
        rect(d, (247, 209, 1033, 613), PANEL, outline=LINE, radius=28)
        d.text((300, 248), "PROJECT ROOM", font=F_LABEL, fill=TEAL)
        d.text((299, 307), "Download free for Mac", font=font(58, True), fill=TEXT)
        d.text((301, 395), "Apple Silicon · open source", font=font(27), fill=MUTED)
        rect(d, (301, 489, 721, 555), "#d9f8ed", radius=13)
        d.text((322, 501), "↓  Download complete", font=font(30, True), fill="#153e3d")
        d.rounded_rectangle((799, 496, 799 + round(174 * ease(local / 3.3)), 514),
                            radius=8, fill=TEAL)
    elif kind == "open":
        rect(d, (296, 208, 984, 612), PANEL, outline=LINE, radius=26)
        d.text((342, 254), "Open a workspace", font=font(52, True), fill=TEXT)
        setup_card(d, 342, 346, 595, 112, "Try the example", "Included local sample")
        setup_card(d, 342, 475, 595, 112, "Open project folder", "Choose your own repository", local > 1.2)
    elif kind == "configure":
        setup_card(d, 79, 246, 326, 282, "YOUR REPO", "app/   specs/   tests/", True)
        setup_card(d, 476, 246, 326, 282, "AGENT REVIEW", "Find real commands", local > 0.8)
        setup_card(d, 873, 246, 326, 282, "PROJECT.YAML", "Services · tests · data", local > 2.5)
        for x in (418, 815):
            d.text((x, 333), "→", font=F_BIG, fill=TEAL)
        d.text((112, 569), "You approve the findings before the agent writes the config.",
               font=F_BODY, fill=MUTED)
    elif kind == "outro":
        d.text((101, 247), "Build in your editor.", font=font(63, True), fill=TEXT)
        d.text((101, 344), "Run and understand it here.", font=font(63, True), fill=TEAL)
        rect(d, (101, 488, 638, 571), "#d9f8ed", radius=15)
        d.text((127, 508), "Download free for Mac  ↗", font=font(35, True), fill="#153e3d")
        d.text((679, 514), "openprojectroom.com", font=font(29), fill=MUTED)


def render(index: int, local: float) -> Image.Image:
    scene = SCENES[index]
    im = make_base(index, local, scene)
    if scene.kind in {"intro", "download", "open", "configure", "outro"}:
        draw_setup(im, scene.kind, local)
    elif scene.kind == "service":
        source = BEFORE if local < 3.0 else AFTER
        app_frame(im, source, scene.crop, None, 0)
        # The source captures show the worker before and after a manual click.
        if local < 3.0:
            focus(im, (1060, 452, 1175, 513), local, 0.8)
    else:
        app_frame(im, IMAGES[scene.image], scene.crop, scene.end_crop,
                  local / max(1, scene.seconds - 0.5))
    return im


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--storyboard", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.storyboard:
        board = Image.new("RGB", (1280, 720 * math.ceil(len(SCENES) / 2)), BG)
        for i, scene in enumerate(SCENES):
            frame = render(i, scene.seconds * 0.55).resize((640, 360))
            board.paste(frame, ((i % 2) * 640, (i // 2) * 360))
        path = OUT / "project-room-60s-storyboard.jpg"
        board.save(path, quality=87)
        print(path)
        return
    target = OUT / "project-room-60s.mp4"
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo",
           "-pixel_format", "rgb24", "-video_size", f"{W}x{H}", "-framerate", str(FPS),
           "-i", "-", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "19",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)]
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for i, scene in enumerate(SCENES):
            for frame_number in range(scene.seconds * FPS):
                local = frame_number / FPS
                frame = render(i, local)
                if i and local < 0.22:
                    previous = render(i - 1, SCENES[i - 1].seconds - 1 / FPS)
                    frame = Image.blend(previous, frame, ease(local / 0.22))
                process.stdin.write(frame.tobytes())
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise SystemExit("ffmpeg encode failed")
    poster = render(4, 2.0)
    poster.save(OUT / "project-room-60s-poster.png")
    print(target)


if __name__ == "__main__":
    main()
