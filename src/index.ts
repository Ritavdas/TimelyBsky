import { BskyAgent, RichText } from "@atproto/api";
import * as dotenv from "dotenv";
import { CronJob } from "cron";
// import * as process from "process";

dotenv.config();

// Rate limiting configuration
const RATE_LIMITS = {
	HOURLY_POINTS: 5000,
	DAILY_POINTS: 35000,
	ACTION_COSTS: {
		CREATE: 3,
		UPDATE: 2,
		DELETE: 1,
	},
} as const;

// Rate limit state
const rateLimit = {
	hourlyPoints: 0,
	dailyPoints: 0,
	lastHourReset: new Date(),
	lastDayReset: new Date(),
};

/**
 * Checks and resets rate limit counters based on time elapsed.
 * Resets hourly points if more than 1 hour has passed since last reset.
 * Resets daily points if more than 24 hours have passed since last reset.
 */
function checkAndResetCounters() {
	const now = new Date();

	if (now.getTime() - rateLimit.lastHourReset.getTime() > 3600000) {
		rateLimit.hourlyPoints = 0;
		rateLimit.lastHourReset = now;
	}

	if (now.getTime() - rateLimit.lastDayReset.getTime() > 86400000) {
		rateLimit.dailyPoints = 0;
		rateLimit.lastDayReset = now;
	}
}

/**
 * Determines if an action can be performed within rate limits.
 * @param action - The type of action to check (CREATE, UPDATE, or DELETE)
 * @returns boolean - True if action can be performed within limits, false otherwise
 */
function canPerformAction(
	action: keyof typeof RATE_LIMITS.ACTION_COSTS
): boolean {
	checkAndResetCounters();
	const cost = RATE_LIMITS.ACTION_COSTS[action];
	return (
		rateLimit.hourlyPoints + cost <= RATE_LIMITS.HOURLY_POINTS &&
		rateLimit.dailyPoints + cost <= RATE_LIMITS.DAILY_POINTS
	);
}

function trackAction(action: keyof typeof RATE_LIMITS.ACTION_COSTS) {
	const cost = RATE_LIMITS.ACTION_COSTS[action];
	rateLimit.hourlyPoints += cost;
	rateLimit.dailyPoints += cost;
}

function getRemainingPoints() {
	return {
		hourly: RATE_LIMITS.HOURLY_POINTS - rateLimit.hourlyPoints,
		daily: RATE_LIMITS.DAILY_POINTS - rateLimit.dailyPoints,
	};
}

// Create a Bluesky Agent
const agent = new BskyAgent({
	service: "https://bsky.social",
});

// Content arrays
const moodEmojis = ["🙂", "😊", "🌟", "✨", "💫", "🌈", "🌸", "🍀"];
const timeMessages = {
	morning: ["Good morning!", "Rise and shine!", "Hello world!"],
	afternoon: ["Good afternoon!", "Hope your day is going well!"],
	evening: ["Good evening!", "Winding down for the day!"],
	night: ["Good night!", "Time to rest!", "✨ Dream big!"],
};

// Helper functions
function getRandomFromArray<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function getTimeBasedMessage(): string {
	const hour = new Date().getHours();

	if (hour >= 5 && hour < 12) return getRandomFromArray(timeMessages.morning);
	if (hour >= 12 && hour < 17)
		return getRandomFromArray(timeMessages.afternoon);
	if (hour >= 17 && hour < 21) return getRandomFromArray(timeMessages.evening);
	return getRandomFromArray(timeMessages.night);
}

/**
 * Creates and publishes a post to Bluesky.
 * Handles rate limiting and rich text processing.
 * @param text - The content of the post
 * @param replyTo - Optional reference to post being replied to
 * @throws Error if post creation fails
 */
async function createPost(
	text: string,
	replyTo?: { uri: string; cid: string }
) {
	if (!canPerformAction("CREATE")) {
		const remaining = getRemainingPoints();
		console.log(
			`Rate limit reached. Remaining points - Hourly: ${remaining.hourly}, Daily: ${remaining.daily}`
		);
		return;
	}

	try {
		const richText = new RichText({ text });
		await richText.detectFacets(agent);

		const post = {
			text: richText.text,
			facets: richText.facets,
			...(replyTo && {
				reply: {
					root: { uri: replyTo.uri, cid: replyTo.cid },
					parent: { uri: replyTo.uri, cid: replyTo.cid },
				},
			}),
		};

		await agent.post(post);
		trackAction("CREATE");
		console.log(`Posted successfully: ${text}`);
	} catch (error: any) {
		if (error.response?.status === 429) {
			console.log("Rate limit exceeded. Waiting before retrying...");
			await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
		} else {
			console.error("Failed to post:", error);
		}
	}
}

/**
 * Processes unread mentions and responds to them.
 * - Fetches recent notifications
 * - Filters for unread mentions
 * - Responds to each mention with a friendly message
 * - Updates seen status for processed notifications
 * - Handles rate limiting between responses
 * @throws Error if mention processing fails
 */
async function handleMentions() {
	try {
		const { data } = await agent.listNotifications({ limit: 20 });
		const unreadMentions = data.notifications.filter(
			(notif) => notif.reason === "mention" && !notif.isRead
		);

		for (const mention of unreadMentions) {
			if (!canPerformAction("CREATE")) {
				console.log(
					"Rate limit reached for mentions. Waiting for next cycle."
				);
				break;
			}

			const response = `Hey ${mention.author.handle}! ${getRandomFromArray(
				moodEmojis
			)} Thanks for the mention!`;
			await createPost(response, { uri: mention.uri, cid: mention.cid });
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}

		if (unreadMentions.length > 0) {
			await agent.updateSeenNotifications();
			trackAction("UPDATE");
		}
	} catch (error) {
		console.error("Failed to handle mentions:", error);
	}
}

/**
 * Main execution loop for the bot.
 * - Logs into Bluesky
 * - Posts time-based message if within rate limits
 * - Processes mentions
 * - Handles errors with retry logic
 * @throws Error if login or core operations fail
 */
async function main() {
	try {
		await agent.login({
			identifier: process.env.BLUESKY_USERNAME!,
			password: process.env.BLUESKY_PASSWORD!,
		});

		if (canPerformAction("CREATE")) {
			const message = `${getTimeBasedMessage()} ${getRandomFromArray(
				moodEmojis
			)}`;
			await createPost(message);
			await handleMentions();
		} else {
			console.log("Rate limit reached. Skipping this cycle.");
		}
	} catch (error) {
		console.error("Error in main:", error);
		setTimeout(main, 5 * 60 * 1000);
	}
}

// Set up cron job
const scheduleExpression = "0 */3 * * *"; // Every 3 hours in production
const scheduleExpressionMinute = "* * * * *"; // Every minute for testing

// Change this line to switch between test and production schedules
const job = new CronJob(scheduleExpressionMinute, () => {
	main().catch((error) => {
		console.error("Unhandled error in main:", error);
	});
});

// Start the bot
main();
job.start();

// Handle shutdown
process.on("SIGINT", () => {
	console.log("Shutting down gracefully....");
	job.stop();
	process.exit(0);
});
