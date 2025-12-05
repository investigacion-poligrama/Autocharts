"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface GoogleAuthProps {
  onAuthSuccess: (token: string) => void;
}

export function GoogleAuth({ onAuthSuccess }: GoogleAuthProps) {
  const [gisLoaded, setGisLoaded] = useState(false);
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 
    "923015740783-jf88ictnu24ofn4raoul82khbqnvhfpc.apps.googleusercontent.com";

  useEffect(() => {
    const loadGoogleScripts = async () => {
      // Cargar GIS
      await loadScript("https://accounts.google.com/gsi/client");
      setGisLoaded(true);

      // Cargar GAPI
      await loadScript("https://apis.google.com/js/api.js");
      await new Promise<void>((resolve) => window.gapi.load("client", resolve));
      await window.gapi.client.init({
        discoveryDocs: [
          "https://sheets.googleapis.com/$discovery/rest?version=v4",
        ],
      });
      setGapiLoaded(true);
    };

    loadGoogleScripts();
  }, []);

  const handleLogin = () => {
    if (!gisLoaded || !gapiLoaded) return;

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp?.access_token) {
          setToken(resp.access_token);
          onAuthSuccess(resp.access_token);
        }
      },
    });
    tokenClient.requestAccessToken();
  };

  return (
    <Button
      onClick={handleLogin}
      disabled={!gisLoaded || !gapiLoaded || !!token}
      className="w-full"
    >
      {token ? "✅ Conectado a Google Drive" : "Conectar con Google Drive"}
    </Button>
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
}