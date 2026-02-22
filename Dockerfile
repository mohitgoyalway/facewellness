# Use official Node.js image
FROM node:20-slim

# Create a non-root user for security (Hugging Face requirement)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy package files and install dependencies
COPY --chown=user package*.json ./
RUN npm install

# Copy the rest of the application
COPY --chown=user . .

# Ensure data directory exists and is writable
RUN mkdir -p data

# Hugging Face Spaces default port is 7860
ENV PORT=7860
EXPOSE 7860

# Start the application
CMD ["node", "index.js"]
