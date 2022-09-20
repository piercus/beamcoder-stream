const test = require('ava');
const {createDemuxerReadStream, createDecoderStream, createEncoderStream, createMuxerWriteStream, createFilterStream, createFiltererStream} = require('../lib/index.js');
const beamcoder = require('beamcoder')
test('demuxer', t => {
	const demuxerStream = createDemuxerReadStream('./test/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm');

	const stream = demuxerStream;
	let n = 0;


	return new Promise((resolve, reject) => {
		demuxerStream.on('error', reject);
		demuxerStream.on('close', resolve);
		demuxerStream.on('data', data => {
			n++;
		})
	}).then(() => {
		t.is(n, 1719)
	});
});

test('demuxer-decoder', t => {
	const streamOpts = {highWaterMark: 16}
	
	const demuxerStream = createDemuxerReadStream('./test/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm', streamOpts);
	const streamIndexPromise = demuxerStream.demuxer.then(dm => dm.streams.find(x => x.codecpar.codec_type === 'video').index)
	const filterStream = createFilterStream(a => streamIndexPromise.then(index => a.stream_index === index), streamOpts)
	const decoderStream = createDecoderStream({demuxer: demuxerStream.demuxer, stream_index: 0}, streamOpts); // eslint-disable-line camelcase

	const stream = demuxerStream.pipe(filterStream).pipe(decoderStream);
	let n = 0;

	return new Promise((resolve, reject) => {
		stream.on('error', reject);
		stream.on('close', resolve);
		stream.on('data', data => {
			n++;
		})
	}).then(() => {
		t.is(n, 555)
	});
});

test('demuxer-decoder-encoder', t => {
	const streamOpts = {highWaterMark: 1}
	
	const demuxerStream = createDemuxerReadStream('./test/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm', streamOpts);
	const streamIndexPromise = demuxerStream.demuxer.then(dm => dm.streams.find(x => x.codecpar.codec_type === 'video').index)
	const filterStream = createFilterStream(a => streamIndexPromise.then(index => a.stream_index === index), streamOpts)
	const decoderStream = createDecoderStream({demuxer: demuxerStream.demuxer, stream_index: 0}, streamOpts); // eslint-disable-line camelcase
		
	const params = demuxerStream.demuxer.then(dm => dm.streams.find(x => x.codecpar.codec_type === 'video').codecpar).then(a => {
		return {
			name: 'libx264',
			width : a.width,
	    height: a.height,
			pix_fmt: a.format,
			color_space: 'bt709',
			time_base: [1, 90000]
		}
	});
	
	const encoderStream = createEncoderStream(params, streamOpts);

	const stream = demuxerStream.pipe(filterStream).pipe(decoderStream).pipe(encoderStream);
	
	let n = 0;

	return new Promise((resolve, reject) => {
		stream.on('error', reject);
		stream.on('close', resolve);
		stream.on('data', data => {
			n++;
		})
	}).then(() => {
		t.is(n, 505)
	});
});

test('demuxer-decoder-filterer', t => {
	const streamOpts = {highWaterMark: 1}
	
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
			width : a.width,
	    height: a.height,
			pix_fmt: a.format,
			color_space: 'bt709',
			time_base: [1, 90000]
		}
	});
	
	const encoderStream = createEncoderStream(params, streamOpts);

	const stream = demuxerStream.pipe(filterStream).pipe(decoderStream).pipe(filtererStream);
	
	let n = 0;

	return new Promise((resolve, reject) => {
		stream.on('error', reject);
		stream.on('close', resolve);
		stream.on('data', data => {
			t.is(data.length, 1)
			t.is(data[0].height, 720)
			t.is(data[0].width, 1280)
			n++;
		})
	}).then(() => {
		t.is(n, 555)
	});
});


test('demuxer-decoder-filterer-encoder', t => {
	const streamOpts = {highWaterMark: 1}
	
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

	return new Promise((resolve, reject) => {
		stream.on('error', reject);
		stream.on('close', resolve);
		stream.on('data', data => {
			n++;
		})
	}).then(() => {
		t.is(n, 505)
	});
});