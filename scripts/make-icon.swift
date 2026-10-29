import AppKit
import Foundation

// Naru: a connected N across a field of local and cloud model nodes.
let output = CommandLine.arguments[1]
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
let rect = NSRect(x: 96, y: 96, width: 832, height: 832)
let background = NSBezierPath(roundedRect: rect, xRadius: 196, yRadius: 196)
NSGraphicsContext.saveGraphicsState()
background.addClip()
let gradient = NSGradient(starting: NSColor(calibratedRed: 0.025, green: 0.035, blue: 0.075, alpha: 1), ending: NSColor(calibratedRed: 0.005, green: 0.007, blue: 0.015, alpha: 1))!
gradient.draw(in: rect, angle: 90)
let palette = [NSColor(calibratedRed: 0.10, green: 0.45, blue: 1, alpha: 1), NSColor(calibratedRed: 0.1, green: 0.82, blue: 1, alpha: 1), NSColor(calibratedRed: 0.55, green: 0.28, blue: 1, alpha: 1), NSColor(calibratedRed: 0.5, green: 0.94, blue: 0.70, alpha: 1)]
for row in 0..<18 {
    for col in 0..<18 {
        let x = CGFloat(146 + col * 42)
        let y = CGFloat(146 + row * 42)
        // Keep the center clear; colored nodes cluster around opposite corners.
        let topRight = max(0.0, 1.0 - hypot(Double(x - 787) / 225, Double(y - 800) / 210))
        let bottomLeft = max(0.0, 1.0 - hypot(Double(x - 237) / 215, Double(y - 225) / 210))
        let strength = max(topRight, bottomLeft)
        if strength < 0.08 { continue }
        let variation = CGFloat((row * 7 + col * 13) % 7) / 7
        let radius = CGFloat(2.2 + 7.0 * strength) * (0.55 + 0.45 * variation)
        palette[(row * 3 + col * 5) % palette.count].withAlphaComponent(CGFloat(0.22 + strength * 0.66)).setFill()
        NSBezierPath(ovalIn: NSRect(x: x-radius, y:y-radius, width:radius*2, height:radius*2)).fill()
    }
}
let logo = NSBezierPath()
logo.lineWidth = 92
logo.lineCapStyle = .round
logo.lineJoinStyle = .round
logo.move(to: NSPoint(x: 316, y: 294))
logo.line(to: NSPoint(x: 316, y: 730))
logo.line(to: NSPoint(x: 708, y: 294))
logo.line(to: NSPoint(x: 708, y: 730))
NSColor(calibratedRed: 0.95, green: 0.97, blue: 1, alpha: 1).setStroke()
logo.stroke()
let nodes: [(CGFloat, CGFloat, NSColor)] = [(316,294,palette[1]),(316,730,palette[0]),(708,294,palette[2]),(708,730,palette[1])]
for (x,y,c) in nodes {
    NSColor(calibratedWhite: 0.04, alpha: 1).setFill()
    NSBezierPath(ovalIn:NSRect(x:x-28,y:y-28,width:56,height:56)).fill()
    c.setFill()
    NSBezierPath(ovalIn:NSRect(x:x-19,y:y-19,width:38,height:38)).fill()
}
NSGraphicsContext.restoreGraphicsState()
background.lineWidth = 2
NSColor(calibratedWhite: 1, alpha: 0.16).setStroke()
background.stroke()
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
