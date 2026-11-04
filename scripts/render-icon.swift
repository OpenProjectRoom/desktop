import AppKit
import Foundation

// Deterministic macOS icon render for the OpenBuildRoom desktop prototype.
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

let background = NSBezierPath(roundedRect: NSRect(x: 42, y: 42, width: 940, height: 940), xRadius: 180, yRadius: 180)
NSColor(srgbRed: 64 / 255, green: 91 / 255, blue: 120 / 255, alpha: 1).setFill()
background.fill()

let cube = NSBezierPath()
cube.lineWidth = 28
cube.lineJoinStyle = .round
cube.lineCapStyle = .round
cube.move(to: NSPoint(x: 512, y: 780))
cube.line(to: NSPoint(x: 758, y: 642))
cube.line(to: NSPoint(x: 758, y: 382))
cube.line(to: NSPoint(x: 512, y: 244))
cube.line(to: NSPoint(x: 266, y: 382))
cube.line(to: NSPoint(x: 266, y: 642))
cube.close()
cube.move(to: NSPoint(x: 266, y: 642))
cube.line(to: NSPoint(x: 512, y: 504))
cube.line(to: NSPoint(x: 758, y: 642))
cube.move(to: NSPoint(x: 512, y: 504))
cube.line(to: NSPoint(x: 512, y: 244))
NSColor.white.setStroke()
cube.stroke()

context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode icon PNG")
}
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let target = root.appendingPathComponent("desktop/assets/icon.png")
try png.write(to: target)
print("Rendered \(target.path)")
