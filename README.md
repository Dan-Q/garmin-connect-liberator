# Garmin Connect liberator

Extract key info (steps, exercise, etc.) from your Garmin Connect account on a daily basis. I asked to use the API, but Garmin were arseholes about it (apparently it'd be fine to get my personal data in an easy way if I were a company, but as an individual? nope), which is basically an open invitation to get the same data by screen-scraping in my mind.

## How to use

### Setup

Install dependencies with something like `npm install puppeteer moment`, I guess?

Create `.env` containing environment variables `GARMIN_CONNECT_USERNAME` and `GARMIN_CONNECT_PASSWORD` (use your Garmin Connect credentials).

### Running

`node index.js`

Output goes into `data` directory.

## Legitimacy

Using this tool might violate Garmin's terms of use, which you definitely read and agreed to, right? Check for yourself.

## License

[This is free and unencumbered software released into the public domain](https://choosealicense.com/licenses/unlicense/).
