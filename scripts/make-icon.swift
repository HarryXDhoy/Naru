import AppKit
import Foundation

let output = CommandLine.arguments[1]
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
let background = NSBezierPath(roundedRect: NSRect(x: 36, y: 36, width: 952, height: 952), xRadius: 218, yRadius: 218)
NSColor(calibratedRed: 0.18, green: 0.26, blue: 0.88, alpha: 1).setFill()
background.fill()
let line = NSBezierPath()
line.lineWidth = 92
line.lineCapStyle = .round
line.lineJoinStyle = .round
line.move(to: NSPoint(x: 290, y: 287))
line.line(to: NSPoint(x: 290, y: 711))
line.curve(to: NSPoint(x: 734, y: 287), controlPoint1: NSPoint(x: 434, y: 711), controlPoint2: NSPoint(x: 590, y: 287))
line.line(to: NSPoint(x: 734, y: 711))
NSColor(calibratedWhite: 0.98, alpha: 1).setStroke()
line.stroke()
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
