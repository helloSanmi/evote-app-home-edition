# backend/Dockerfile

# Use a node:18-alpine base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy all project files into the working directory
COPY . .

# Build the Next.js application for production
RUN npm run build

# Expose the application port
EXPOSE 5000

# Start the application in production mode
CMD ["npm", "start"]