# Bluesky Mood Bot 🙂

A simple Bluesky bot that posts mood emojis and time-based messages while respecting Bluesky's rate limits.

## Features

- Posts emoji messages on a scheduled basis
- Time-based greetings (morning, afternoon, evening, night)
- Responds to mentions
- Built-in rate limiting to comply with Bluesky's restrictions
- Configurable posting schedules (test/prod modes)

## Prerequisites

- Node.js (v14 or higher)
- npm
- A Bluesky account for the bot

## Installation

1. Clone the repository:

```bash
git clone [your-repo-url]
cd bskybots
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory:

```env
BLUESKY_USERNAME=your-username.bsky.social
BLUESKY_PASSWORD=your-password
```

## Rate Limits

The bot respects Bluesky's rate limits:

- 5,000 points per hour
- 35,000 points per day
- Action costs:
  - CREATE: 3 points
  - UPDATE: 2 points
  - DELETE: 1 point

## Running the Bot

### Development Mode (posts every minute)

```bash
npm run dev
```

### Production Mode (posts every 3 hours)

```bash
npm start
```

## License

MIT
