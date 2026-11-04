import Foundation
import Speech
import AVFoundation

setbuf(stdout, nil)

func emit(_ type: String, _ value: String = "") {
    let payload = ["type": type, type == "error" ? "message" : "text": value]
    if let data = try? JSONSerialization.data(withJSONObject: payload),
       let line = String(data: data, encoding: .utf8) {
        print(line)
    }
}

let recognizer = SFSpeechRecognizer(locale: Locale.current)
guard let recognizer = recognizer, recognizer.supportsOnDeviceRecognition else {
    emit("error", "On-device speech recognition is unavailable for this Mac or language.")
    exit(2)
}

let engine = AVAudioEngine()
var request: SFSpeechAudioBufferRecognitionRequest?
var task: SFSpeechRecognitionTask?
var finished = false

func stop() {
    if finished { return }
    finished = true
    if engine.isRunning { engine.stop() }
    engine.inputNode.removeTap(onBus: 0)
    request?.endAudio()
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
        task?.cancel()
        emit("stopped")
        exit(0)
    }
}

func start() {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    let nextRequest = SFSpeechAudioBufferRecognitionRequest()
    nextRequest.requiresOnDeviceRecognition = true
    nextRequest.shouldReportPartialResults = true
    request = nextRequest
    task = recognizer.recognitionTask(with: nextRequest) { result, error in
        if let result = result { emit("transcript", result.bestTranscription.formattedString) }
        if let error = error, !finished {
            emit("error", error.localizedDescription)
            stop()
        }
    }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in nextRequest.append(buffer) }
    do {
        engine.prepare()
        try engine.start()
        emit("started")
    } catch {
        emit("error", error.localizedDescription)
        stop()
    }
}

SFSpeechRecognizer.requestAuthorization { status in
    guard status == .authorized else {
        emit("error", "Speech recognition permission was not granted.")
        exit(3)
    }
    AVCaptureDevice.requestAccess(for: .audio) { allowed in
        guard allowed else {
            emit("error", "Microphone permission was not granted.")
            exit(3)
        }
        DispatchQueue.main.async { start() }
    }
}

DispatchQueue.global().async {
    while let line = readLine() {
        if line == "stop" { DispatchQueue.main.async { stop() }; break }
    }
}
RunLoop.main.run()
