#!/bin/sh

echo "Starting Ollama..."

ollama serve &

echo "Waiting for Ollama to start..."
sleep 5

echo "Checking for qwen2.5vl:3b..."

if ollama list | grep -q "qwen2.5vl:3b"; then
    echo "qwen2.5vl:3b already exists."
else
    echo "qwen2.5vl:3b not found. Pulling model..."
    ollama pull qwen2.5vl:3b
fi

echo "Ollama is ready."

wait
