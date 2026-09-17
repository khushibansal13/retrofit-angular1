FROM ollama/ollama:latest

EXPOSE 11434

CMD ["sh", "-c", "ollama serve & sleep 5 && ollama pull qwen2.5vl:3b && wait"]
