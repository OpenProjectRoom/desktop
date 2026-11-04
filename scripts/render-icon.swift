import AppKit
import Foundation

// Render the selected workspace mark at macOS app-icon resolution.
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

let background = NSBezierPath(roundedRect: NSRect(x: 32, y: 32, width: 960, height: 960), xRadius: 240, yRadius: 240)
color(234, 240, 237).setFill()
background.fill()

let frame = NSBezierPath(roundedRect: NSRect(x: 176, y: 208, width: 672, height: 608), xRadius: 112, yRadius: 112)
frame.lineWidth = 56
color(32, 52, 59).setStroke()
frame.stroke()

let dividers = NSBezierPath()
dividers.lineWidth = 56
dividers.move(to: NSPoint(x: 176, y: 656))
dividers.line(to: NSPoint(x: 848, y: 656))
dividers.move(to: NSPoint(x: 384, y: 656))
dividers.line(to: NSPoint(x: 384, y: 208))
dividers.stroke()

color(116, 165, 153).setFill()
for x in [272.0, 368.0] {
    NSBezierPath(ovalIn: NSRect(x: x - 27.2, y: 736 - 27.2, width: 54.4, height: 54.4)).fill()
}

let check = NSBezierPath()
check.lineWidth = 56
check.lineJoinStyle = .round
check.lineCapStyle = .round
check.move(to: NSPoint(x: 528, y: 416))
check.line(to: NSPoint(x: 608, y: 352))
check.line(to: NSPoint(x: 752, y: 528))
color(76, 139, 124).setStroke()
check.stroke()

context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode icon PNG")
}
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let target = root.appendingPathComponent("desktop/assets/icon.png")
try png.write(to: target)
print("Rendered \(target.path)")
