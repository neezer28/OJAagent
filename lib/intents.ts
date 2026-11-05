import { OpenAPI, OneClickService } from "@defuse-protocol/one-click-sdk-typescript";

OpenAPI.BASE = "https://1click.chaindefuser.com";
if (process.env.ONECLICK_JWT) {
  OpenAPI.TOKEN = process.env.ONECLICK_JWT;
}

export { OneClickService };
