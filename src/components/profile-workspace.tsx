"use client";
import { Card, CardLink } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { Arrow } from "@/components/ui/arrow";
import { authDisplayName, type PublicAuthUser } from "@/lib/auth-user";

import { useEffect, useState, type FormEvent } from "react";

const STORAGE_KEY = "formchain.profile.v1";
const FOCUSES = [
  "Build consistency",
  "Improve technique",
  "Build strength",
  "Explore movement",
];

export default function ProfileWorkspace({
  user,
}: {
  user: PublicAuthUser | null;
}) {
  const [name, setName] = useState("");
  const [focus, setFocus] = useState(FOCUSES[0]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const stored: unknown = raw ? JSON.parse(raw) : null;
        if (
          stored &&
          typeof stored === "object" &&
          "version" in stored &&
          stored.version === 1
        ) {
          if ("name" in stored && typeof stored.name === "string")
            setName(stored.name.slice(0, 60));
          if (
            "focus" in stored &&
            typeof stored.focus === "string" &&
            FOCUSES.includes(stored.focus)
          )
            setFocus(stored.focus);
        }
      } catch {
        setMessage(
          "Your saved details could not be loaded. You can enter them again below.",
        );
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, name: name.trim(), focus }),
      );
      setName(name.trim());
      setMessage("Profile saved on this device.");
    } catch {
      setMessage(
        "Your browser could not save these details. Please check its storage settings.",
      );
    }
  }

  return (
    <div className="profile-workspace">
      <header className="page-head profile-heading">
        <div>
          <h1>Profile</h1>
          <p>Your details and preferences, saved on this device.</p>
        </div>
      </header>

      <Card variant="profile" aria-labelledby="profile-details-title">
        <div className="profile-identity">
          <span className="profile-initial" aria-hidden="true">
            {name.trim().charAt(0).toUpperCase() ||
              (user && authDisplayName(user).charAt(0).toUpperCase()) ||
              "F"}
          </span>
          <div>
            <h2 id="profile-details-title">Your details</h2>
            {user ? (
              <p>Signed in as {authDisplayName(user)}.</p>
            ) : (
              <p>Saved on this device. Sign in to carry them with you.</p>
            )}
          </div>
        </div>
        <form onSubmit={save} className="profile-form">
          <label htmlFor="profile-name">Display name</label>
          <Input
            id="profile-name"
            autoComplete="nickname"
            maxLength={60}
            placeholder="What should we call you?"
            value={name}
            disabled={!ready}
            onChange={(event) => {
              setName(event.target.value);
              setMessage("");
            }}
          />
          <label htmlFor="profile-focus">Training focus</label>
          <Select
            id="profile-focus"
            value={focus}
            disabled={!ready}
            onValueChange={(next) => {
              setFocus(next);
              setMessage("");
            }}
          >
            {FOCUSES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
          <p className="profile-note">
            A personal note for your profile. It won’t change your movement
            analysis.
          </p>
          <Button variant="outline" type="submit" disabled={!ready}>
            Save details
          </Button>
          <p role="status" className="profile-note">
            {message}
          </p>
        </form>
      </Card>

      <CardLink
        variant="profile"
        href="/profile/rewards"
        className="profile-rewards-link"
      >
        <div>
          <h2>Rewards</h2>
          <p>
            Your session points, ranking, working examples, and optional
            workout receipts.
          </p>
        </div>
        <Arrow />
      </CardLink>

      <Card variant="profile" aria-labelledby="profile-storage-title">
        <h2 id="profile-storage-title">Account & storage</h2>
        <dl className="profile-metadata">
          <div>
            <dt>Profile type</dt>
            <dd>
              {user
                ? "Auth0 account · local details on this device"
                : "Local profile · no sign-in"}
            </dd>
          </div>
          <div>
            <dt>Details & history</dt>
            <dd>Saved in this browser</dd>
          </div>
          <div>
            <dt>Latest analysis</dt>
            <dd>Available in this tab</dd>
          </div>
          <div>
            <dt>Original videos</dt>
            <dd>Not saved in your profile</dd>
          </div>
        </dl>
        <p className="profile-note">
          {user
            ? "Signing in identifies you. Display name, training focus, and session history still live in this browser until cloud sync exists."
            : "Details do not sync between devices. Clearing browser data removes your saved profile and history."}
        </p>
        <div className="profile-account-actions">
          {user ? (
            <a href="/auth/logout" className="button outline">
              Sign out
            </a>
          ) : (
            <>
              <ButtonLink href="/sign-in" variant="primary">
                Sign in
              </ButtonLink>
              <ButtonLink href="/sign-up" variant="outline">
                Create account
              </ButtonLink>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
