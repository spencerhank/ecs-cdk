# Use an official Node.js runtime as a base image
FROM node:14

# Set the working directory to /usr/src/app
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json files to the container at /usr/src/app
COPY ./client/package*.json ./

# Install any dependencies
RUN npm install

# Copy the contents of the ./cmd directory to the container at /usr/src/app
COPY ./client .


# Expose port 3000 for healthcheck
EXPOSE 3000

# Command to run your application
CMD ["node", "main.js"]
