import AppKit
import Foundation

// Keep the native app icon in sync with desktop/icon.svg.
let output = CommandLine.arguments[1]
let image = NSImage(size: NSSize(width: 1024, height: 1024))
image.lockFocus()
NSGraphicsContext.saveGraphicsState()
let transform = NSAffineTransform()
transform.translateX(by: 0, yBy: 1024)
transform.scaleX(by: 1, yBy: -1)
transform.concat()

NSColor(srgbRed: 16 / 255, green: 43 / 255, blue: 75 / 255, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 96, y: 96, width: 832, height: 832), xRadius: 196, yRadius: 196).fill()

func wave(_ offset: CGFloat) {
    let path = NSBezierPath()
    path.move(to: NSPoint(x: 238, y: 454 + offset))
    path.curve(to: NSPoint(x: 416, y: 380 + offset), controlPoint1: NSPoint(x: 327, y: 454 + offset), controlPoint2: NSPoint(x: 327, y: 380 + offset))
    path.curve(to: NSPoint(x: 594, y: 454 + offset), controlPoint1: NSPoint(x: 505, y: 380 + offset), controlPoint2: NSPoint(x: 505, y: 454 + offset))
    path.curve(to: NSPoint(x: 786, y: 380 + offset), controlPoint1: NSPoint(x: 683, y: 454 + offset), controlPoint2: NSPoint(x: 683, y: 380 + offset))
    path.lineWidth = 68
    path.lineCapStyle = .round
    path.stroke()
}
NSColor(srgbRed: 241 / 255, green: 250 / 255, blue: 1, alpha: 1).setStroke()
wave(0)
wave(183)
NSGraphicsContext.restoreGraphicsState()
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
