const {Readable} = require('stream');
const process = require('process');
const beamcoder = require('beamcoder'); // Use require('beamcoder') externally

class PacketGenerator extends Readable {
	constructor(options = {}) {
		const {stream_index = 0, frameFormat} = options;
		options.objectMode = true;
		super(options);
		this.stream_index = stream_index;
		this.frameFormat = frameFormat;
		this.i = 0;
	}

	_construct(callback) {
		callback();
	}

	_read() {
		this.i++;
		const {i} = this;
		if (i > 200) {
			this.push(null);

			return;
		}

		const frame = beamcoder.frame(this.frameFormat).alloc();

		const {linesize} = frame;
		const [ydata, bdata, cdata] = frame.data;
		frame.pts = i + 100;

		for (let y = 0; y < frame.height; y++) {
			for (let x = 0; x < linesize[0]; x++) {
				ydata[(y * linesize[0]) + x] = x + y + (i * 3);
			}
		}

		for (let y = 0; y < frame.height / 2; y++) {
			for (let x = 0; x < linesize[1]; x++) {
				bdata[(y * linesize[1]) + x] = 128 + y + (i * 2);
				cdata[(y * linesize[1]) + x] = 64 + x + (i * 5);
			}
		}

		this.push(frame);
	}
}

const {createMuxerWriteStream, createEncoderStream} = require('..');

async function run() {
	const start = process.hrtime();

	const muxerStream = createMuxerWriteStream({
		format_name: 'mp4',
		url: 'file:./tmp/test.mp4',
		stream: {
			name: 'h264',
			time_base: [1, 90_000],
			interleaved: true,
			codecpar: {
				width: 1920,
				height: 1080,
				format: 'yuv420p',
			},
		},
	});

	const encParameters = {
		name: 'libx264',
		width: 1920,
		height: 1080,
		bit_rate: 2_000_000,
		time_base: [1, 25],
		framerate: [25, 1],
		gop_size: 10,
		max_b_frames: 1,
		pix_fmt: 'yuv420p',
		priv_data: {preset: 'slow'},
	};
	const readStream = new PacketGenerator({stream_index: 0, frameFormat: {
		width: encParameters.width,
		height: encParameters.height,
		format: encParameters.pix_fmt,
	}});
	const encoderStream = createEncoderStream(encParameters, {
		postProcessing(packets) {
			for (const pkt of packets) {
				pkt.duration = 1;
				pkt.stream_index = 0;
				pkt.pts = pkt.pts * 90_000 / 25;
				pkt.dts = pkt.dts * 90_000 / 25;
			}

			return packets;
		}},
	);

	const stream = readStream.pipe(encoderStream).pipe(muxerStream);

	stream.on('close', () => {
		console.log('Total time', process.hrtime(start));
	});
}

run();
