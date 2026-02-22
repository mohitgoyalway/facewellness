# Use official Node.js image
FROM node:20-slim

# The 'node' user already exists with UID 1000 in this image
USER node
ENV HOME=/home/node \
    PATH=/home/node/.local/bin:$PATH

WORKDIR $HOME/app

# Copy package files and install dependencies with correct ownership
COPY --chown=node package*.json ./
RUN npm install

# Copy the rest of the application
COPY --chown=node . .

# Ensure data directory exists
RUN mkdir -p data

# Hugging Face Spaces default port is 7860
ENV PORT=7860
EXPOSE 7860

# Start the application
CMD ["node", "index.js"]
