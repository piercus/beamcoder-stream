const test = require('ava');// eslint-disable-line ava/no-ignored-test-files
const {createDemuxerReadStream, createDecoderStream, createEncoderStream, createMuxerWriteStream, createFilterStream} = require('../lib/index.js');

test('e2e', t => {
	const streamOptions = {highWaterMark: 1};

	const demuxerStream = createDemuxerReadStream('./test/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm', streamOptions);
	const streamIndexPromise = demuxerStream.demuxer.then(dm => dm.streams.find(x => x.codecpar.codec_type === 'video').index);
	const filterStream = createFilterStream(a => streamIndexPromise.then(index => a.stream_index === index), streamOptions);
	const decoderStream = createDecoderStream({demuxer: demuxerStream.demuxer, stream_index: 0}, streamOptions);

	const parameters = demuxerStream.demuxer.then(dm => dm.streams.find(x => x.codecpar.codec_type === 'video').codecpar).then(a => ({
		name: 'libx264',
		width: a.width,
		height: a.height,
		pix_fmt: a.format,
		color_space: 'bt709',
		time_base: [1, 90_000],
	}));
	const encoderStream = createEncoderStream(parameters, streamOptions);

	const muxerStream = createMuxerWriteStream({
		filename: './tmp/file.mp4',
		streams: encoderStream.encoder.then(parameters_ => [{
			name: 'h264',
			time_base: parameters_.time_base,
			encoderName: 'libx264',
			codecpar: {
				width: parameters_.width,
				height: parameters_.height,
				format: parameters_.pix_fmt,
				color_space: parameters_.color_space,
				sample_aspect_ratio: [1, 1],
			},
		}]),
	}, streamOptions);

	const stream = demuxerStream.pipe(filterStream).pipe(decoderStream).pipe(encoderStream).pipe(muxerStream);

	let n = 0;

	return new Promise((resolve, reject) => {
		stream.on('error', reject);
		stream.on('close', resolve);
		stream.on('data', () => {
			n++;
		});
	}).then(() => {
		t.is(n, 554);
	});
});
