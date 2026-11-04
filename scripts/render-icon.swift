import AppKit
import Foundation

// Render the selected Open Room mark into the macOS icon tile at 1024 px.
let size = 1024
guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fatalError("Could not create icon bitmap")
}
guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Could not create icon graphics context")
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
context.shouldAntialias = true

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> NSColor {
    NSColor(srgbRed: red / 255, green: green / 255, blue: blue / 255, alpha: 1)
}

let background = NSBezierPath(roundedRect: NSRect(x: 32, y: 32, width: 960, height: 960), xRadius: 220, yRadius: 220)
color(233, 243, 240).setFill()
background.fill()

// The SVG identity uses a 100 × 100 view box with its origin at the top left.
func point(_ x: CGFloat, _ y: CGFloat) -> NSPoint {
    NSPoint(x: 112 + x * 8, y: CGFloat(size) - 112 - y * 8)
}

let frame = NSBezierPath()
frame.move(to: point(25, 8))
frame.line(to: point(75, 8))
frame.curve(to: point(92, 25), controlPoint1: point(84.4, 8), controlPoint2: point(92, 15.6))
frame.line(to: point(92, 46))
frame.line(to: point(74, 46))
frame.line(to: point(74, 26))
frame.line(to: point(26, 26))
frame.line(to: point(26, 74))
frame.line(to: point(58, 74))
frame.line(to: point(58, 92))
frame.line(to: point(25, 92))
frame.curve(to: point(8, 75), controlPoint1: point(15.6, 92), controlPoint2: point(8, 84.4))
frame.line(to: point(8, 25))
frame.curve(to: point(25, 8), controlPoint1: point(8, 15.6), controlPoint2: point(15.6, 8))
frame.close()
color(32, 61, 75).setFill()
frame.fill()

let corner = NSBezierPath()
corner.move(to: point(73, 57))
corner.line(to: point(92, 57))
corner.line(to: point(92, 76))
corner.curve(to: point(76, 92), controlPoint1: point(92, 84.8), controlPoint2: point(84.8, 92))
corner.line(to: point(64, 92))
corner.line(to: point(64, 74))
corner.line(to: point(73, 74))
corner.close()
color(131, 182, 172).setFill()
corner.fill()

context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode icon PNG")
}
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
for relativePath in ["desktop/assets/icon.png", "build/icon.png"] {
    let target = root.appendingPathComponent(relativePath)
    try png.write(to: target)
    print("Rendered \(target.path)")
}
