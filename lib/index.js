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
		const {postProcessing = a => a} = streamOptions;
		const promise = waitOptions(options).then(o => {
			// Console.log({key, o}, o.inputParams, o.outputParams, beamcoder[key])
			const inst = beamcoder[key](o);
			return inst;
		});

		const stream = new Transform({...streamOptions, objectMode: true,
			construct(cb) {
				promise.then(bmcdr => {
					this[key] = bmcdr;
				}).then(() => cb(), error => cb(error));
			},
			transform(chunk, encoding, callback) {
				this[key][action](chunk)
					.then(o => fn.bind(this, postProcessing)(o))
					.then(() => {
						// Console.log(`Done ${key}`)
						callback();
					}, error => {
						// Console.log(`${key} error`)
						callback(error);
					});
			},
			flush(callback) {
				if (doFlush) {
					this[key].flush()
						.then(o => fn.bind(this, postProcessing)(o))
						.then(() => callback(), error => callback(error));
				} else {
					callback();
				}
			},
		});

		stream[key] = promise;

		return stream;
	};
};

const createDecoderStream = buildTransformStreamCreator('decoder', 'decode', function (postProcessing, {frames}) {
	if (frames.length > 0) {
		this.push(postProcessing(frames));
	}
});

const createEncoderStream = buildTransformStreamCreator('encoder', 'encode', function (postProcessing, {packets}) {
	if (packets.length > 0) {
		this.push(postProcessing(packets));
	}
});

const createFiltererStream = buildTransformStreamCreator('filterer', 'filter', function (postProcessing, o) {
	for (const {frames} of o) {
		if (frames.length > 0) {
			this.push(postProcessing(frames));
		}
	}
}, false);

const createMuxerWriteStream = function (options, streamOptions = {}) {
	const optionsPromise = waitOptions(options);

	const muxerPromise = optionsPromise.then(o => {
		const options2 = {...o};
		if (options2.muxer) {
			const {muxer} = options2;
			if (options.stream) {
				const {stream} = options2;
				const {codecpar} = stream;
				delete stream.codecpar;
				delete options2.stream;

				const vstr = muxer.newStream(stream); // Set to false for manual interleaving, true for automatic
				Object.assign(vstr.codecpar, codecpar);
			}

			if (options2.url) {
				return muxer.openIO({url: options2.url}).then(() => muxer);
			}

			return muxer;
		}

		const {url} = options2;
		delete options2.url;
		const {stream} = options2;
		const {codecpar} = stream;
		delete stream.codecpar;
		delete options2.stream;

		const muxer = beamcoder.muxer(options2);

		const vstr = muxer.newStream(stream); // Set to false for manual interleaving, true for automatic
		Object.assign(vstr.codecpar, codecpar);

		return muxer.openIO({url}).then(() => muxer);
	});

	const stream = new Writable({...streamOptions, objectMode: true,
		construct(callback) {
			muxerPromise
				.then(mux => mux.writeHeader().then(() => {
					this.muxer = mux;
				}))
				.then(() => callback(), error => callback(error));
		},
		write(packets, encoding, callback) {
			// Console.log('writeFrame')
			let p = Promise.resolve();

			for (const packet of packets) {
				p = p.then(() => this.muxer.writeFrame(packet));
			}

			return p.then(callback, callback);
		},
		final(callback) {
			this.muxer.writeTrailer().then(callback, callback);
		}});

	stream.muxer = muxerPromise;

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
