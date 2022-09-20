const {Readable, Writable, Transform} = require('stream');
const beamcoder = require('beamcoder');

const waitOptions = function (object) {
	return Promise.resolve(object).then(o => {
		if (typeof (o) !== 'object') {
			return o;
		}

		const keys = Object.keys(o);
		return Promise.all(keys.map(k => o[k])).then(results => {
			const object_ = {};
			for (const [index, k] of keys.entries()) {
				object_[k] = results[index];
			}

			return object_;
		});
	});
};

const createDemuxerReadStream = function (options, streamOptions = {}) {
	const demuxer = waitOptions(options).then(o => beamcoder.demuxer(o));

	const stream = new Readable({...streamOptions, objectMode: true,
		construct(cb) {
			demuxer.then(() => cb(), error => cb(error));
		},
		read() {
			demuxer
				.then(dm => dm.read())
				.then(packet => {
					this.push(packet);
				});
		}});

	stream.demuxer = demuxer;

	return stream;
};

const buildTransformStreamCreator = function (key, action, fn, doFlush = true) {
	return function (options, streamOptions = {}) {
		const promise = waitOptions(options).then(o => {
			// Console.log({key, o}, o.inputParams, o.outputParams, beamcoder[key])
			const inst = beamcoder[key](o);
			return inst;
		});

		const stream = new Transform({...streamOptions, objectMode: true,
			construct(cb) {
				promise.then(() => cb(), error => cb(error));
			},
			transform(chunk, encoding, callback) {
				// Console.log(`Run ${action}`, JSON.stringify(chunk, null, 4))
				promise
					.then(bmcdr => bmcdr[action](chunk))
					.then(o =>
						// Console.log(`Run ${key} fn`, o)
						fn.bind(this)(o),
					)
					.then(() => {
						// Console.log(`Done ${key}`)
						callback();
					}, error => {
						// Console.log(`${key} error`)
						callback(error);
					});
			},
			destroy(error, callback) {
				if (doFlush) {
					promise
						.then(bmcdr => bmcdr.flush())
						.then(() => callback(), error => callback(error));
				} else {
					callback();
				}
			}});

		stream[key] = promise;

		return stream;
	};
};

const createDecoderStream = buildTransformStreamCreator('decoder', 'decode', function ({frames}) {
	if (frames.length > 0) {
		this.push(frames);
	}
});

const createEncoderStream = buildTransformStreamCreator('encoder', 'encode', function ({packets}) {
	for (const p of packets) {
		this.push(p);
	}
});

const createFiltererStream = buildTransformStreamCreator('filterer', 'filter', function (o) {
	for (const {frames} of o) {
		if (frames.length > 0) {
			this.push(frames);
		}
	}
}, false);

const createMuxerWriteStream = function (options, streamOptions = {}) {
	const optionsPromise = waitOptions(options);

	const muxer = optionsPromise.then(o => {
		const options2 = {...o};
		delete options2.streams;
		return options2;
	}).then(options2 => {
		const muxer = beamcoder.muxer(options2);
		return muxer;
	});

	const streams = optionsPromise.then(o => {
		const {streams} = o;
		if (!Array.isArray(streams)) {
			throw (new TypeError('streams is not an array'));
		}

		if (streams.length === 0) {
			throw (new Error('Empty streams'));
		}

		return streams;
	});

	const stream = new Writable({...streamOptions, objectMode: true,
		construct(callback) {
			Promise.all([muxer, streams])
				.then(([mux, strms]) => {
					for (const s of strms) {
						const {codecpar} = s;
						delete s.codecpar;
						const localStream = mux.newStream(s);
						Object.assign(localStream.codecpar, codecpar);
					}

					return mux;
				})
				.then(mux => mux.openIO())
				.then(mux => mux.writeHeader())
				.then(() => callback(), error => callback(error));
		},
		write(packet, encoding, callback) {
			muxer
				.then(mux => mux.writeFrame(packet))
				.then(() => callback(), error => callback(error));
		},
		destroy(error, callback) {
			muxer
				.then(muxer => muxer.writeTrailer())
				.then(() => callback(), error_ => callback(error_));
		}});

	stream.muxer = muxer;

	return stream;
};

const createFilterStream = function (fn, streamOptions = {}) {
	const stream = new Transform({...streamOptions, objectMode: true,
		transform(chunk, encoding, callback) {
			Promise.resolve(fn(chunk))
				.then(a => {
					if (a) {
						this.push(chunk);
					}
				})
				.then(() => callback(), error => callback(error));
		}});

	return stream;
};

module.exports = {
	createMuxerWriteStream,
	createDecoderStream,
	createEncoderStream,
	createDemuxerReadStream,
	createFilterStream,
	createFiltererStream,
};
