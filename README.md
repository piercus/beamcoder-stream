# beamcoder-stream

Node.js Stream API for beamcoder

## Installation

```
npm install beamcoder-stream
```

## Usage example

```js
const {
	createDemuxerReadStream, 
	createDecoderStream, 
	createFilterStream, 
	createFiltererStream
} = require('../lib/index.js');

// Which file to open
const demuxerStream = createDemuxerReadStream('./test/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm');

// the filter stream only choose to read video stream only (removing audio data)
const dm = await demuxerStream.demuxer
const {codecpar, index} = dm.streams.find(x => x.codecpar.codec_type === 'video')
const filterStream = createFilterStream(a => a.stream_index === index)

// decode the video stream
const decoderStream = createDecoderStream({demuxer: demuxerStream.demuxer, stream_index: 0}); // eslint-disable-line camelcase

// use a filterer to rescale the frames
const inputParams = [{ 
	width: codecpar.width, 
	height: codecpar.height, 
	pixelFormat: codecpar.format, 
	timeBase:  [1, 90000],
	pixelAspect: codecpar.sample_aspect_ratio
}];

const filtererStream = createFiltererStream({
	filterType: 'video',
	inputParams,
	outputParams: [{pixelFormat: codecpar.format}],
	filterSpec: 'scale=1280:720'
});

// Now you can do the pipe magic !
const stream = demuxerStream.pipe(filterStream).pipe(decoderStream).pipe(filtererStream);

stream.on('data', (frames) => {
	// play with your frames here
})
```

## Documentation

This library is a wrapper around [beamcoder](https://github.com/Streampunk/beamcoder) so to get details on the possible input configuration, you will be able to get infos from beamcoder.