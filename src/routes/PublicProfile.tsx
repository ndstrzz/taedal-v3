import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toaster";
import { useAuth } from "../state/AuthContext";
import FollowButton from "../components/FollowButton";
import FollowListModal from "../components/FollowListModal";
import LikesGrid from "../components/LikesGrid";
import CollectionsGrid from "../components/CollectionsGrid";
import SuggestionsRail from "../components/SuggestionsRail";
import { updateSEO } from "../lib/seo";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  website?: string | null;
  instagram?: string | null;
  twitter?: string | null;
};

type Artwork = {
  id: string;
  title: string | null;
  cover_url: string | null;
  image_cid: string | null;
  created_at: string;
  owner?: string | null;
};

type Counts = { posts: number; followers: number; following: number };
type Badge = { kind: string; label: string };

const PAGE_SIZE = 12;
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");

// icons
const GlobeIcon = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm7.93 9h-3.09a15.7 15.7 0 0 0-1.15-5.01A8.03 8.03 0 0 1 19.93 11ZM12 4c.9 0 2.3 2.04 2.92 6H9.08C9.7 6.04 11.1 4 12 4ZM8.31 6a15.7 15.7 0 0 0-1.16 5H4.07A8.03 8.03 0 0 1 8.31 6ZM4.07 13h3.08c.12 1.77.5 3.5 1.16 5a8.03 8.03 0 1 1-4.24-5Zm4.99 0h6c-.62 3.96-2.02 6-3 6s-2.38-2.04-3-6Zm6.63 5c.66-1.5 1.04-3.23 1.16-5h3.08a8.03 8.03 0 0 1-4.24 5Z"/></svg>);
const IgIcon   = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3
