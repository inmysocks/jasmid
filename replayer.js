function Replayer(midiFile, synth) {
	var trackStates = [];
	var beatsPerMinute = 120;
	var ticksPerBeat = midiFile.header.ticksPerBeat;
	
	for (var i = 0; i < midiFile.tracks.length; i++) {
		trackStates[i] = {
			'nextEventIndex': 0,
			'ticksToNextEvent': (
				midiFile.tracks[i].length ?
					midiFile.tracks[i][0].deltaTime :
					null
			)
		};
	}
	
	var nextEventInfo;
	var samplesToNextEvent = 0;
	
	function getNextEvent() {
		var ticksToNextEvent = null;
		var nextEventTrack = null;
		var nextEventIndex = null;
		//console.log(trackStates);
		
		for (var i = 0; i < trackStates.length; i++) {
			// console.log(i + ': ' + trackStates[i].nextEventIndex + ', ' + trackStates[i].ticksToNextEvent);
			if (
				trackStates[i].ticksToNextEvent != null
				&& (ticksToNextEvent == null || trackStates[i].ticksToNextEvent < ticksToNextEvent)
			) {
				ticksToNextEvent = trackStates[i].ticksToNextEvent;
				nextEventTrack = i;
				nextEventIndex = trackStates[i].nextEventIndex;
			}
		}
		if (nextEventTrack != null) {
			/* consume event from that track */
			var nextEvent = midiFile.tracks[nextEventTrack][nextEventIndex];
			if (midiFile.tracks[nextEventTrack][nextEventIndex + 1]) {
				trackStates[nextEventTrack].ticksToNextEvent += midiFile.tracks[nextEventTrack][nextEventIndex + 1].deltaTime;
			} else {
				trackStates[nextEventTrack].ticksToNextEvent = null;
			}
			trackStates[nextEventTrack].nextEventIndex += 1;
			/* advance timings on all tracks by ticksToNextEvent */
			for (var i = 0; i < trackStates.length; i++) {
				if (trackStates[i].ticksToNextEvent != null) {
					trackStates[i].ticksToNextEvent -= ticksToNextEvent
				}
			}
			nextEventInfo = {
				'ticksToEvent': ticksToNextEvent,
				'event': nextEvent,
				'track': nextEventTrack
			}
			var beatsToNextEvent = ticksToNextEvent / ticksPerBeat;
			var secondsToNextEvent = beatsToNextEvent / (beatsPerMinute / 60);
			samplesToNextEvent += secondsToNextEvent * synth.sampleRate;
		} else {
			nextEventInfo = null;
			samplesToNextEvent = null;
		}
	}
	
	getNextEvent();
	
	function generate(samples) {
		var data = new Array(samples*2);
		var samplesRemaining = samples;
		var dataOffset = 0;
		
		while (true) {
			if (samplesToNextEvent != null && samplesToNextEvent <= samplesRemaining) {
				/* generate samplesToNextEvent samples, process event and repeat */
				var samplesToGenerate = Math.ceil(samplesToNextEvent);
				synth.generateIntoBuffer(samplesToGenerate, data, dataOffset);
				dataOffset += samplesToGenerate * 2;
				samplesRemaining -= samplesToGenerate;
				samplesToNextEvent -= samplesToGenerate;
				
				handleEvent();
				getNextEvent();
			} else {
				/* generate samples to end of buffer */
				if (samplesRemaining > 0) {
					synth.generateIntoBuffer(samplesRemaining, data, dataOffset);
					samplesToNextEvent -= samplesRemaining;
				}
				break;
			}
		}
		return data;
	}
	
	function handleEvent() {
		var event = nextEventInfo.event;
		switch (event.type) {
			case 'meta':
				switch (event.subtype) {
					case 'setTempo':
						beatsPerMinute = 60000000 / event.microsecondsPerBeat
				}
				break;
			case 'channel':
				switch (event.subtype) {
					case 'noteOn':
						synth.channels[event.channel].noteOn(event.noteNumber, event.velocity);
						break;
					case 'noteOff':
						synth.channels[event.channel].noteOff(event.noteNumber, event.velocity);
						break;
					case 'programChange':
						//console.log('program change to ' + event.programNumber);
						synth.channels[event.channel].setProgram(event.programNumber);
						break;
				}
				break;
		}
	}
	
	function replay(audio) {
		console.log('replay');
		audio.write(generate(44100));
		setTimeout(function() {replay(audio)}, 10);
	}
	
	return {
		'getNextEvent': getNextEvent,
		'replay': replay
	}
}
