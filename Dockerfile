FROM node:20 as base
WORKDIR /app

FROM base as deps-prod
COPY package.json yarn.lock ./
ENV NODE_ENV=production
RUN yarn install --frozen-lockfile

FROM base as deps-dev
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM base as build
COPY --from=deps-dev /app ./
COPY . ./
RUN yarn build

FROM base
USER node
COPY --from=deps-prod --chown=node:node /app ./
COPY --from=build --chown=node:node /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3333

CMD ["yarn", "start"]
