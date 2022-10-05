const {Writable} = require('stream'); // eslint-disable-line ava/no-ignored-test-files
const test = require('ava');
const {createDemuxerReadStream} = require('../lib/index.js');

test('demuxer with a pause', t => {
	const streamOptions = {highWaterMark: 1, reconnecting: true};

	const demuxerStream = createDemuxerReadStream('./test/Big_Buck_Bunny_first_23_seconds_1080p.ogv.480p.vp9.webm', streamOptions);

	let n = 0;

	const fakeWritable = new Writable({
		objectMode: true,
		highWaterMark: streamOptions.highWaterMark,
		write(chunk, encoding, callback) {
			n++;
			callback();
		},
	});

	const totalStream = demuxerStream.pipe(fakeWritable);
	// DemuxerStream.on('data', data => {
	// 	console.log({data})
	// })

	return new Promise((resolve, reject) => {
		setTimeout(() => {
			totalStream.end(error => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		}, 2000);
	}).then(() => {
		t.is(n, 1719);
	});
});
