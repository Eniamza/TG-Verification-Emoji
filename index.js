const TelegramBot = require("node-telegram-bot-api");
const configService = require("./config");

(async () => {
	const ldb = await configService();
	const botToken = (await ldb.read()).get("botToken").value();

	// Create a new Telegram bot instance with your bot token
	const bot = new TelegramBot(botToken, {
		polling: true,
	});

	// Restrict new users from sending messages, media, or GIFs
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
				can_send_messages: false,
			},
		});
		console.log("::RESTRICTIONS APPLIED ✅::");

		const welcomeMessage = `Welcome, [${msg.from.id}](tg://user?id=${msg.from.id}) to the group!\n\nTo start the verification process, click the button below.`;
		const welcomeMessageOptions = {
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: "Verify Now",
							callback_data: `startVerification_${userId}`,
						},
					],
				],
			},
			parse_mode: "Markdown",
		};

		const welcome = await bot.sendMessage(
			chatId,
			welcomeMessage,
			welcomeMessageOptions
		);

		console.log("::WELCOME MESSAGE SENT ✉️::");

		startCountDown(
			welcome.chat.id,
			welcome.message_id,
			userId,
			welcomeMessage,
			welcomeMessageOptions
		);
	});

	bot.on("callback_query", async query => {
		let emojis = (await ldb.read()).get("emojis").value();
		emojis = (emojis || []).map((i, idx) => ({ emoji: i, index: idx }));

		if (query.data.startsWith("startVerification_")) {
			const __user = query.data.split("_")[1] || "";
			const chatId = query.message.chat.id;
			const messageId = query.message.message_id;

			if (query.from.id != __user) {
				await bot.answerCallbackQuery(query.id, {
					text: "This message is not for you 🙃",
					show_alert: true,
				});
				return;
			}

			await bot.deleteMessage(chatId, messageId);

			// Shuffle the emojis
			const shuffledEmojis = shuffleArray(emojis);

			// Create the message with emoji buttons
			const message = `Please select the correct emoji to pass the verification!`;

			const messageOptions = {
				reply_markup: {
					inline_keyboard: [
						shuffledEmojis.map(i => ({
							text: i.emoji,
							callback_data: `verify-${i.index}_${__user}`,
						})),
					],
				},
			};
			const verification = await bot.sendMessage(
				chatId,
				message,
				messageOptions
			);

			startCountDown(
				verification.chat.id,
				verification.message_id,
				__user,
				message,
				messageOptions
			);
		} else if (query.data.startsWith("verify-")) {
			const __emoji = query.data.split("-")[1].split("_")[0] || "";
			const __user = query.data.split("_")[1] || "";
			const chatId = query.message.chat.id;

			if (query.from.id != __user) {
				await bot.answerCallbackQuery(query.id, {
					text: "This message is not for you 🙃",
					show_alert: true,
				});
				return;
			}

			if (emojis[0].index != __emoji) {
				await bot.answerCallbackQuery(query.id, {
					text: "Incorrect Answer",
					show_alert: true,
				});

				await bot.deleteMessage(
					query.message.chat.id,
					query.message.message_id
				);
				// Kick the user from the group
				await bot.kickChatMember(chatId, __user);
				console.log("USER KICKED, REASON: INCORRECT_VERIFICATION_ANSWER");

				// Unban the user after 10 seconds
				bot.unbanChatMember(chatId, __user);
				return;
			}

			await bot.deleteMessage(query.message.chat.id, query.message.message_id);

			// Allow the user to send messages and media
			await bot.restrictChatMember(chatId, __user, {
				can_send_messages: true,
			});
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

	function startCountDown(chatId, messageId, userId, text, messageOptions) {
		let count = 10;
		setInterval(() => {
			count -= 1;
			bot
				.editMessageText(`${text} (${count})`, {
					chat_id: chatId,
					message_id: messageId,
					...messageOptions,
				})
				.then(() => {
					if (count <= 0) {
						kickDeleteMsgAndKickUser(chatId, messageId, userId);
					}
				})
				.catch(() => {});
		}, 1000);
	}

	async function kickDeleteMsgAndKickUser(chatId, messageId, userId) {
		const verificationTimeout = (await ldb.read())
			.get("verificationTimeout")
			.value();

		bot
			.deleteMessage(chatId, messageId)
			.then(() => {
				// Kick the user from the group
				bot.kickChatMember(chatId, userId);
				console.log("USER KICKED, REASON: VERFICATION_TIMEOUT");

				// Unban the user after xxx seconds
				setTimeout(() => {
					bot.unbanChatMember(chatId, userId);
				}, verificationTimeout || 10 * 1000);
			})
			.catch(() => {});
	}
})();
