# Use an official Node runtime as the base image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the Astro app
RUN npm run build

# Expose the port the app runs on
EXPOSE 4321

# Command to run the app with host binding
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4321"]