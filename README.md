# Luxury Holiday Accommodation Search Demo

This repository contains a demo Express app for hybrid search and retrieval-augmented generation (RAG) using MongoDB, Atlas Search, OpenAI, and Voyage AI.

The main server app is `app12.js`, which serves an interactive search UI and exposes a POST `/search` endpoint.

## Features

- `text`: Atlas Search text search using a compound `must` query.
- `hybrid`: hybrid search with `$vectorSearch` and `$search` combined via `$rankFusion`.
- `llm_atlas`: extracts `location` and `amenities` from free-text input and formulates an Atlas Search query.
- `Rag with Voyage AI`: vector retrieval with Voyage AI embeddings plus an LLM summary layer.
- `llm`: OpenAI-only search assistant mode.
- `llm with non voyage rag` - returns an error to say that the required embeddings do not exist

## Prerequisites

- Node.js 18+ (or compatible version)
- MongoDB Atlas / MongoDB URI containing the `blueBook` collection
- OpenAI API key

## Environment

Create a `.env` file or export environment variables before running.

Required variables:

- `OPENAI_API_KEY` — OpenAI API key
- `MONGODB_URI` — MongoDB connection string

Optional variables:

- `MONGODB_DB` — MongoDB database name (default: `sample_airbnb`)
- `BLUEBOOK_SEARCH_INDEX` — Atlas Search text index name (default: `bluebook_text_index`)
- `BLUEBOOK_VECTOR_INDEX` — Atlas vector index name (default: `bluebook_vector_index`)
- `PORT` — HTTP port (default: `3000`)

## Install

```bash
npm install
```

## Run

```bash
node app12.js
```

Then open:

```text
http://localhost:3000
```

## Usage

The home page provides a search form with the following inputs:

- `searchText`
- `amenities`
- `location`
- `mode`

Supported modes include:

- `text`
- `hybrid`
- `llm_atlas`
- `Rag with Voyage AI`
- `llm`
- `Rag without Voyage`

## Notes

- The app uses the `blueBook` collection from MongoDB.
- `Rag with Voyage AI` mode performs vector retrieval and builds a summary over candidate documents.
- `llm_atlas` mode uses OpenAI to extract location and amenities and convert them into an Atlas Search query.

## Files

- `app12.js` — main Express server and search app
- `.env.example` — sample environment variable template
- `package.json` — project dependencies

## Troubleshooting

- If the server cannot connect to MongoDB, verify `MONGODB_URI` and database permissions.
- If OpenAI requests fail, verify `OPENAI_API_KEY` is valid and has correct access.
