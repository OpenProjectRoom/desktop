import AppKit
import Foundation

// Render the Project Room mark from desktop/assets/rail.svg at 1024 px.
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
), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Could not create icon bitmap")
}

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> NSColor {
    NSColor(srgbRed: red / 255, green: green / 255, blue: blue / 255, alpha: 1)
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
context.shouldAntialias = true

color(233, 243, 240).setFill()
NSBezierPath(roundedRect: NSRect(x: 30, y: 30, width: 964, height: 964), xRadius: 220, yRadius: 220).fill()
color(23, 59, 75).setFill()
NSBezierPath(roundedRect: NSRect(x: 168, y: 168, width: 688, height: 688), xRadius: 160, yRadius: 160).fill()

let pale = color(233, 243, 240)
pale.setStroke()
for y in [614.0, 408.0] {
    let line = NSBezierPath()
    line.lineWidth = 62
    line.lineCapStyle = .round
    line.move(to: NSPoint(x: 307, y: y))
    line.line(to: NSPoint(x: 718, y: y))
    line.stroke()
}

for (x, y) in [(450.0, 614.0), (605.0, 408.0)] {
    pale.setFill()
    NSBezierPath(ovalIn: NSRect(x: x - 94, y: y - 94, width: 188, height: 188)).fill()
    color(23, 59, 75).setFill()
    NSBezierPath(ovalIn: NSRect(x: x - 32, y: y - 32, width: 64, height: 64)).fill()
}

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
