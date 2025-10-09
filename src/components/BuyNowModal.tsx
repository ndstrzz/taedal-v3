// src/components/BuyNowModal.tsx
import React from "react";
import CheckoutModal from "./CheckoutModal";

type Props = {
  open: boolean;
  onClose: () => void;
  onPurchased?: () => Promise<void> | void;
  // minimal props to describe the thing being bought
  artworkId: string;
  listingId: string;
  title: string;
  price: string;
  currency: "ETH" | "WETH" | "USD";
  imageUrl?: string;
};

export default function BuyNowModal(props: Props) {
  return <CheckoutModal {...props} />;
}
