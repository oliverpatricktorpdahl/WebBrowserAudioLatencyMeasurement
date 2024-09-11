import { latencyMeasurer } from "./latencyMeasurer.js";
class app {
    static initialize(microphoneId, outputDeviceId) {
        app.audioContext = app.audioNode = null;


        let audioWorklet = (typeof AudioWorkletNode === 'function') ? 1 : 0;
        app.data = {
            buffersize: audioWorklet ? 128 : 512,
            samplerate: '?',
            audioWorklet: audioWorklet
        };
        app.microphoneId = microphoneId;
        app.outputDeviceId = outputDeviceId;
    }



    static reset() {
        if (app.audioContext != null) app.audioContext.close();
        app.audioContext = app.audioNode = null;
    }

    static onAudioInputPermissionDenied(error) {
        app.displayResult('Error: ' + error + ' Please check the microphone permission.');
    }

    static onMessageFromAudioScope(message) {
        if (message.latencyMs < 0) {
            app.displayResult('The environment is too loud! Please try it again in a quieter environment.');
        } else if (message.state == 11) {
            if (message.latency < 1) app.displayResult('The variance is too big. Please try it again in a quieter environment.');
            else {
                app.data.ms = message.latency;
                app.displayResult('Result: ' + message.latency + 'ms 10 ms or lower allows for the best real-time interactive experience. Below 50 ms provides acceptable results for simple audio use-cases and maximum 100 ms is acceptable for gaming.');
            }
        } else {
            let percentage = ((parseInt(message.state) - 1) / 10) * 100;
            if (percentage < 1) percentage = 1; else if (percentage > 100) percentage = 100;
            console.log('Analyzing...', percentage + '%');
        }
    }

    static onAudioSetupFinished() {
        let audioInput = app.audioContext.createMediaStreamSource(app.inputStream);
        audioInput.connect(app.audioNode);
        app.audioNode.connect(app.audioContext.destination);
    }

    static displayResult(message) {
        if (app.audioContext != null) app.audioContext.close();
        app.audioContext = app.audioNode = null;
        console.log('RESULT FROM LATENCY TEST: ', message)
    }

    static onAudioPermissionGranted(inputStream) {
        app.inputStream = inputStream;
        let audioTracks = inputStream.getAudioTracks();
        for (let audioTrack of audioTracks) {
            audioTrack.applyConstraints({ autoGainControl: false, echoCancellation: false, noiseSuppression: false });
        }

        if (!app.data.audioWorklet) {
            app.latencyMeasurer = new latencyMeasurer();
            app.latencyMeasurer.toggle();
            app.lastState = 0;
            app.audioNode = app.audioContext.createScriptProcessor(app.data.buffersize, 2, 2);

            app.audioNode.onaudioprocess = function (e) {
                app.latencyMeasurer.processInput(e.inputBuffer.getChannelData(0), e.inputBuffer.getChannelData(1), app.data.samplerate, e.inputBuffer.length);
                app.latencyMeasurer.processOutput(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1));

                if (app.lastState != app.latencyMeasurer.state) {
                    app.lastState = app.latencyMeasurer.state;
                    app.onMessageFromAudioScope({ state: app.lastState, latency: app.latencyMeasurer.latencyMs });
                }
            }

            app.onAudioSetupFinished();
        } else {
            let processorPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/processor.js';
            console.log("Trying to import processor... : ", processorPath)

            app.audioContext.audioWorklet.addModule(processorPath).then(() => {
                class CustomAudioNode extends AudioWorkletNode {
                    constructor(audioContext, moduleInstance, name) {
                        super(audioContext, name, {
                            'processorOptions': {
                                'samplerate': app.data.samplerate
                            },
                            'outputChannelCount': [2]
                        });
                    }
                    sendMessageToAudioScope(message) { this.port.postMessage(message); }
                }
                app.audioNode = new CustomAudioNode(app.audioContext, app, 'MyProcessor');
                app.audioNode.port.onmessage = (event) => {
                    if (event.data == '___ready___') app.onAudioSetupFinished(); else app.onMessageFromAudioScope(event.data);
                };
            });
        }
    }

    static start() {
        console.log('Processing starting ...')
        let AudioContext = window.AudioContext || window.webkitAudioContext || false;
        app.audioContext = new AudioContext({ latencyHint: 0 });
        if (app.outputDeviceId !== "default") {
            app.audioContext.setSinkId(app.outputDeviceId);
        }
        app.data.samplerate = app.audioContext.sampleRate;
        let constraints = {
            audio: {
                deviceId: app.microphoneId === "default" ? undefined : { exact: app.microphoneId },
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
            },
            video: false
        };
        if (navigator.mediaDevices.getUserMedia) navigator.mediaDevices.getUserMedia(constraints).then(app.onAudioPermissionGranted).catch(app.onAudioInputPermissionDenied);
        else app.onAudioInputPermissionDenied("Can't access getUserMedia.");
    }
}





export { app as latencyMeasure }