const low = require("lowdb");
const FileAsync = require("lowdb/adapters/FileAsync");

const init = async () => {
	// create a new file adapter using the provided storage path
	const adapter = new FileAsync(`./config.json`);

	// create a new lowdb instance using the adapter
	const ldb = await low(adapter);

	// set default values for each collection
	ldb
		.defaults({
			emojis: ["😊", "🍾", "🥸", "🍷", "🥖"],
			verificationTimeout: 10000,
			is2faEnabled: true,
			botToken: "",
		})
		.write();

	return ldb;
};

module.exports = init;
