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
	})
};

const createDemuxerReadStream = function (options, streamOpts = {}) {
	const demuxer = waitOptions(options).then(o => beamcoder.demuxer(o));

	const stream = new Readable(Object.assign({}, streamOpts,{
		objectMode: true,
		construct(cb) {
			demuxer.then(() => cb(), error => cb(error));
		},
		read() {
			demuxer
			.then(dm => dm.read())
			.then(packet => {
				this.push(packet)
			});
		}
	}));
	
	stream.demuxer = demuxer;

	return stream;
};

const buildTransformStreamCreator = function (key, action, fn, doFlush = true) {
	return function (options, streamOpts = {}) {
		const promise = waitOptions(options).then(o => {
			// console.log({key, o}, o.inputParams, o.outputParams, beamcoder[key])
			const inst = beamcoder[key](o)
			return inst
		});

		const stream = new Transform(Object.assign({}, streamOpts,{
			objectMode: true,
			construct(cb) {
				promise.then(() => cb(), error => cb(error));
			},
			transform(chunk, encoding, callback) {
				// console.log(`Run ${action}`, JSON.stringify(chunk, null, 4))
				promise
					.then(bmcdr => {
						return bmcdr[action](chunk)
					})
					.then(o => {
						// console.log(`Run ${key} fn`, o)
						return fn.bind(this)(o)
					})
					.then(() => {
						// console.log(`Done ${key}`)
						callback()
					}, error => {
						// console.log(`${key} error`)
						callback(error)
					});
			},
			destroy(err, callback) {
				if(doFlush){
					promise
						.then(bmcdr => bmcdr.flush())
						.then(() => callback(), error => callback(error));
				} else {
					callback()
				}
			}
		}));

		stream[key] = promise;

		return stream;
	};
};

const createDecoderStream = buildTransformStreamCreator('decoder', 'decode', function ({frames}) {
	if(frames.length > 0){
		this.push(frames);
	}
});

const createEncoderStream = buildTransformStreamCreator('encoder', 'encode', function ({packets}) {
	for (const p of packets) {
		this.push(p);
	}
});

const createFiltererStream = buildTransformStreamCreator('filterer', 'filter', function (o) {
	o.forEach(({frames, name}) => {
		if(frames.length > 0){
			this.push(frames);
		}
	})
}, false);

const createMuxerWriteStream = function (options, streamOpts = {}) {
	const optionsPromise = waitOptions(options);

	const muxer = optionsPromise.then(o => {
		const options2 = Object.assign({}, o);
		delete options2.streams;
		return options2
	}).then(options2 => {
		const muxer = beamcoder.muxer(options2);
		return muxer
	})

	const streams = optionsPromise.then(o => {
		const streams = o.streams
		if(!Array.isArray(streams)){
			throw(new Error(`streams is not an array`))
		}
		if(streams.length === 0){
			throw(new Error(`Empty streams`))
		}
		return streams
	});

	const stream = new Writable(Object.assign({}, streamOpts,{
		objectMode: true,
		construct(callback) {
			Promise.all([muxer, streams])
				.then(o => {
					return new Promise((resolve, reject) => setTimeout(() => resolve(o), 1000))
				})
				.then(([mux, strms]) => {
					
					for (const s of strms) {
						const codecpar = s.codecpar
						delete s.codecpar;
						const localStream = mux.newStream(s);
						Object.assign(localStream.codecpar, codecpar)
					}

					return mux;
				})
				.then(o2 => {
					console.log('openIO')
					return new Promise((resolve, reject) => setTimeout(() => resolve(o2), 1000))
				})
				.then(mux => mux.openIO())
				.then(o2 => {
					console.log('writeHeader')
					return new Promise((resolve, reject) => setTimeout(() => resolve(o2), 1000))
				})				
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
				.then(() => callback(), err => callback(err));
		},
	}));

	stream.muxer = muxer;

	return stream;
};

const createFilterStream = function (fn, streamOpts = {}) {

	const stream = new Transform(Object.assign({}, streamOpts,{
		objectMode: true,
		transform(chunk, encoding, callback) {
			Promise.resolve(fn(chunk))
				.then(a => {
					if(a) {
						this.push(chunk)
					}
				})
				.then(() => callback(), error => callback(error));
		}
	}));

	return stream;
};



module.exports = {
	createMuxerWriteStream,
	createDecoderStream,
	createEncoderStream,
	createDemuxerReadStream,
	createFilterStream,
	createFiltererStream
};
