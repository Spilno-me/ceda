FROM node:22-alpine

# Enable Corepack for Yarn 4
RUN corepack enable

WORKDIR /app

# Copy Yarn config files first
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Install dependencies
RUN yarn install --immutable

COPY . .

RUN yarn build

EXPOSE 3030

CMD ["node", "dist/server.js"]
