const test = require('ava');
const {createDemuxerReadStream, createDecoderStream, createEncoderStream, createMuxerWriteStream, createFilterStream} = require('../lib/index.js');
const beamcoder = require('beamcoder')

test('e2e', t => {
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
	
	const muxerStream = createMuxerWriteStream({
		filename: './tmp/file.mp4',
		streams: encoderStream.encoder.then(enc => {
			return [{ 
				name: 'h264', 
				time_base: params.time_base, 
				encoderName: 'libx264'
				// ,
        /*codecpar: {
          width: params.width, 
					height: params.height, 
					format: params.pix_fmt, 
					color_space: params.color_space,
          sample_aspect_ratio: [1, 1]
        }*/
      }];
		}),
	}, streamOpts);
	
	const stream = demuxerStream.pipe(filterStream).pipe(decoderStream).pipe(encoderStream).pipe(muxerStream);
	
	let n = 0;
	
	return new Promise((resolve, reject) => {
		stream.on('error', reject);
		stream.on('close', resolve);
		stream.on('data', data => {
			n++;
		})
	}).then(() => {
		t.is(n, 554)
	});
});
