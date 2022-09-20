# beamcoder-stream

Node.js Stream API for beamcoder

## Installation

```
npm install beamcoder-stream
```

## Usage example

```js
const {createDemuxerReadStream, createDecoderStream, createEncoderStream, createFilterStream, createFiltererStream} = require('../lib/index.js');

const demuxerStream = createDemuxerReadStream('./test/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm', streamOpts);
const streamIndexPromise = demuxerStream.demuxer.then(dm => dm.streams.find(x => x.codecpar.codec_type === 'video').index)
const filterStream = createFilterStream(a => streamIndexPromise.then(index => a.stream_index === index), streamOpts)
const decoderStream = createDecoderStream({demuxer: demuxerStream.demuxer, stream_index: 0}, streamOpts); // eslint-disable-line camelcase

const codecparPromise = demuxerStream.demuxer.then(dm => dm.streams.find(x => x.codecpar.codec_type === 'video').codecpar)

const filtererStream = createFiltererStream({
	filterType: 'video',
	inputParams: codecparPromise.then(a => ([
		{
			width: a.width,
			height: a.height,
			pixelFormat: a.format,
			timeBase:  [1, 90000],
			pixelAspect: a.sample_aspect_ratio,
		}
	])),
	outputParams: codecparPromise.then(a => ([
		{
			pixelFormat: a.format
		}
	])),
	filterSpec: 'scale=1280:720'
}, streamOpts);


const params = codecparPromise.then(a => {
	return {
		name: 'libx264',
		width : 1280,
		height: 720,
		pix_fmt: a.format,
		color_space: 'bt709',
		time_base: [1, 90000]
	}
});

const encoderStream = createEncoderStream(params, streamOpts);

const stream = demuxerStream.pipe(filterStream).pipe(decoderStream).pipe(filtererStream).pipe(encoderStream);

let n = 0;

stream.on('data', data => {
	// play with your encoded data here
})

```

## Documentation

This library is a wrapper around [beamcoder](https://github.com/Streampunk/beamcoder) so to get details on the possible input configuration, you will be able to get infos from beamcoder.

