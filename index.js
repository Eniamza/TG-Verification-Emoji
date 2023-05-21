const TelegramBot = require("node-telegram-bot-api");
const configService = require("./config");

var members = {};
var chatDb = {};

(async () => {
	const ldb = await configService();
	const botToken = (await ldb.read()).get("botToken").value();

	// Create a new Telegram bot instance with your bot token
	const bot = new TelegramBot(botToken, {
		polling: true,
	});

	bot.on("new_chat_members", async msg => {
		if (msg.from.is_bot) return;

		const chatId = msg.chat.id;
		const userId = msg.from.id;

		console.log("::NEW MEMEBER JOINED:: " + userId);

		const is2faEnabled = (await ldb.read()).get("is2faEnabled").value();

		if (!is2faEnabled) return;

		// Restrict user from sending messages
		await bot.restrictChatMember(chatId, userId, {
			permissions: {
				can_send_other_messages: false,
				can_add_web_page_previews: false,
			},
		});
		console.log("::RESTRICTIONS APPLIED ✅::");

		const memberName =
			msg.from.username || `${msg.from.first_name} ${msg.from.last_name}`;

		const mentionUser = `[${memberName}](tg://user?id=${msg.from.id})`;

		let emojis = (await ldb.read()).get("emojis").value();
		emojis = (emojis || []).map((i, idx) => ({ emoji: i, index: idx }));

		// Shuffle the emojis
		const shuffledEmojis = shuffleArray(emojis);
		const message = `Welcome, [${memberName}](tg://user?id=${msg.from.id}) Welcome au restaurant la $CREPE! 🥞

		$CREPE is the preferred Exquisite Gourmet Token for Sophistiquée Tradoors 🥸
		
		Vive la technologie cryptographique! 🍾
		
		Twitter:
		Website:
		Buy $CREPE (Uniswap):
		Chart (DexTools):
		Contract address:
		
		Press 🥞to prove that you're a sophisticated Monsieur/ Madame and not a dégénérer Merde de JEET!`;
		const messageOptions = {
			reply_markup: {
				inline_keyboard: [
					shuffledEmojis.map(i => ({
						text: i.emoji,
						callback_data: `verify-${i.index}_${userId}`,
					})),
				],
			},
			parse_mode: "Markdown",
		};

		const welcome = await bot.sendMessage(chatId, message, messageOptions);

		console.log("::WELCOME MESSAGE SENT ✉️::");

		startCountDown(
			welcome.chat.id,
			welcome.message_id,
			userId,
			message,
			messageOptions
		);
	});

	bot.on("callback_query", async query => {
		let emojis = (await ldb.read()).get("emojis").value();
		emojis = (emojis || []).map((i, idx) => ({ emoji: i, index: idx }));

		if (query.data.startsWith("verify-") && !members[query.data]) {
			const __emoji = query.data.split("-")[1].split("_")[0] || "";
			const __user = query.data.split("_")[1] || "";
			const chatId = query.message.chat.id;

			const uid = `${chatId}+${__user}`;
			if (members[uid]) return;
			members[uid] = true; // to avoid multiple taps on button

			if (query.from.id != __user) {
				delete members[uid];
				await bot.answerCallbackQuery(query.id, {
					text: "This message is not for you 🙃",
					show_alert: true,
				});
				return;
			}

			clearInterval(members[__user]);

			if (emojis[0].index != __emoji) {
				await bot.answerCallbackQuery(query.id, {
					text: "Incorrect Answer",
					show_alert: true,
				});

				await bot
					.deleteMessage(query.message.chat.id, query.message.message_id)
					.catch(() => {});
				// Kick the user from the group
				await bot
					.banChatMember(chatId, __user)
					.then(() =>
						console.log("USER KICKED, REASON: INCORRECT_VERIFICATION_ANSWER")
					)
					.catch(() => {});

				// Unban the user
				bot
					.unbanChatMember(chatId, __user)
					.then(() => console.log("USER UNBAN ✅"))
					.catch(() => {});

				delete members[uid];
				return;
			}

			await bot.deleteMessage(query.message.chat.id, query.message.message_id);

			// Allow the user to send messages and media
			await bot
				.restrictChatMember(chatId, __user, {
					can_send_other_messages: true,
					can_add_web_page_previews: true,
				})
				.then(() => console.log("::USER VERIFIED ✅::"));

			delete members[uid];
		}
	});

	// Function to shuffle the array
	function shuffleArray(array) {
		const shuffledArray = [...array];
		for (let i = shuffledArray.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffledArray[i], shuffledArray[j]] = [
				shuffledArray[j],
				shuffledArray[i],
			];
		}
		return shuffledArray;
	}

	async function startCountDown(
		chatId,
		messageId,
		userId,
		text,
		messageOptions
	) {
		const verificationTimeout =
			(await ldb.read()).get("verificationTimeout").value() || 10000;

		let count = verificationTimeout / 1000 || 10;
		members[userId] = setInterval(() => {
			count -= 1;
			bot
				.editMessageText(`${text} (${count})`, {
					chat_id: chatId,
					message_id: messageId,
					...messageOptions,
				})
				.catch(() => {})
				.finally(() => {
					if (count <= 0) {
						clearInterval(members[userId]);
						const messageUUID = `${chatId},${messageId},${userId}`;
						if (!chatDb[messageUUID]) {
							chatDb[messageUUID] = true;
							kickDeleteMsgAndKickUser(chatId, messageId, userId);
						}
					}
				});
		}, 1000);
	}

	function kickDeleteMsgAndKickUser(chatId, messageId, userId) {
		bot
			.deleteMessage(chatId, messageId)
			.catch(() => {})
			.finally(async () => {
				// Kick the user from the group
				await bot
					.banChatMember(chatId, userId)
					.then(() => console.log("USER KICKED, REASON: VERFICATION_TIMEOUT"));

				// Unban the user
				bot
					.unbanChatMember(chatId, userId)
					.then(() => console.log("USER UNBAN ✅"));
			});
	}
})();
