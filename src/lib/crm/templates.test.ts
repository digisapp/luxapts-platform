import { describe, expect, it } from "vitest";
import { mailtoHref, mergeValues, missingSenderFields, renderTemplate, smsHref, whenText } from "./templates";
import { EMPTY_TWIML, optKeyword, twilioConfig, twilioSignature, validTwilioSignature } from "./twilio";

const TODAY = "2026-10-12";
const sender = { name: "Nathan", company: "" };
const dana = {
  first_name: "Dana",
  property_address: "100 Example St #5F",
  neighborhood: "Tribeca",
  beds: 1,
  price: 5400,
  added_at: "2025-11-03T17:00:00Z",
};

describe("renderTemplate", () => {
  const lease =
    "Hi {first_name}, it's {my_name}. You reached out {when} about {listing}. If your lease is coming up, I can send you a few options in {neighborhood} around {budget}. Want me to?";

  it("fills every field from the contact and sender", () => {
    expect(renderTemplate(lease, mergeValues(dana, sender, TODAY))).toBe(
      "Hi Dana, it's Nathan. You reached out last November about 100 Example St #5F. If your lease is coming up, I can send you a few options in Tribeca around $5,400. Want me to?"
    );
  });

  it("falls back gracefully when the contact has little data", () => {
    const bare = { first_name: null, property_address: null, neighborhood: null, beds: null, price: null, added_at: null };
    expect(renderTemplate(lease, mergeValues(bare, sender, TODAY))).toBe(
      "Hi there, it's Nathan. You reached out a while back about an apartment. If your lease is coming up, I can send you a few options in the city around your budget. Want me to?"
    );
    // An empty field leaves no double space behind.
    expect(renderTemplate("A few new {beds} listings, {company}.", mergeValues(bare, sender, TODAY))).toBe("A few new listings.");
    expect(renderTemplate("It's {my_name} from {company}.", mergeValues(bare, sender, TODAY))).toBe("It's Nathan.");
    expect(
      renderTemplate("It's {my_name} from {company}.", mergeValues(bare, { name: "Nathan", company: "Example Realty" }, TODAY))
    ).toBe("It's Nathan from Example Realty.");
  });

  it("never quotes a sale price as a budget, and keeps unknown braces", () => {
    const buyer = { ...dana, price: 1_315_000 };
    expect(renderTemplate("around {budget} {other}", mergeValues(buyer, sender, TODAY))).toBe("around your budget {other}");
  });

  it("says when they inquired in plain words", () => {
    expect(whenText("2026-10-01T16:00:00Z", TODAY)).toBe("recently");
    expect(whenText("2026-03-10T16:00:00Z", TODAY)).toBe("in March");
    expect(whenText("2025-11-03T17:00:00Z", TODAY)).toBe("last November");
    expect(whenText("2023-06-01T16:00:00Z", TODAY)).toBe("back in June 2023");
  });

  it("names sender fields that still need filling in", () => {
    expect(missingSenderFields("it's {my_name} from {company}", { name: "", company: "" })).toEqual(["my_name", "company"]);
    expect(missingSenderFields("Hi {first_name}", { name: "", company: "" })).toEqual([]);
  });
});

describe("links", () => {
  it("prefills texts and emails", () => {
    expect(smsHref("+12125550123", "Hi Dana & co")).toBe("sms:+12125550123?&body=Hi%20Dana%20%26%20co");
    expect(smsHref("+12125550123")).toBe("sms:+12125550123");
    expect(mailtoHref("a@b.co", "Apartments in Tribeca", "Hi Dana,\nok")).toBe(
      "mailto:a@b.co?subject=Apartments%20in%20Tribeca&body=Hi%20Dana%2C%0Aok"
    );
  });
});

describe("twilio", () => {
  const url = "https://staycio.com/api/webhooks/twilio/sms";
  const params = { From: "+12125550123", Body: "Yes still looking", MessageSid: "SM123", To: "+13055550100" };

  it("signs requests the way Twilio does (checked against Python's hmac)", () => {
    expect(twilioSignature(url, params, "test-token")).toBe("/S99z81XEy5BrJ5F6vtzm447CFY=");
    expect(validTwilioSignature(["https://other.example/x", url], params, "/S99z81XEy5BrJ5F6vtzm447CFY=", "test-token")).toBe(true);
    expect(validTwilioSignature([url], { ...params, Body: "tampered" }, "/S99z81XEy5BrJ5F6vtzm447CFY=", "test-token")).toBe(false);
    expect(validTwilioSignature([url], params, null, "test-token")).toBe(false);
  });

  it("recognises opt-out and opt-in keywords only as the whole message", () => {
    expect(optKeyword(" STOP ")).toBe("stop");
    expect(optKeyword("Unsubscribe.")).toBe("stop");
    expect(optKeyword("start")).toBe("start");
    expect(optKeyword("please stop texting")).toBeNull();
  });

  it("stays off until the account, token and a sender are all set", () => {
    expect(twilioConfig({})).toBeNull();
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBeNull();
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+13055550100" })).toMatchObject({
      from: "+13055550100",
      messagingServiceSid: null,
    });
    expect(EMPTY_TWIML).toContain("<Response>");
  });
});
