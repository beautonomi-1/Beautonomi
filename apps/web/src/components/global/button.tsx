"use client"
import React, { useState } from "react";

interface ButtonPrimaryProps {
  variant: "primaryButton" | "secondaryButton";
  text: string;
  padding?: string;
  fontSize?: string; 
  width?: string;
}

const ButtonPrimary: React.FC<ButtonPrimaryProps> = ({ variant, text, padding, fontSize, width }) => {
  const [hover, setHover] = useState(false);

  // Define default values for padding and font size
  const defaultPadding = "9px 27px";
  const defaultFontSize = "14px";
  const defaultWidth = ""; // Default width added

  const variants = {
    primaryButton: {
      normalStyle: {
        color: "#222222",
        backgroundColor: "#ffffff",
        border: "1px solid #222222",
        padding: padding || defaultPadding, // Use provided padding or default
        fontSize: fontSize || defaultFontSize, // Use provided font size or default
        fontWeight: "500",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "background-color 200ms, color 200ms",
        width: width || defaultWidth, // Use provided width or default
      },
      hoverStyle: {
        backgroundColor: "#f7f7f7",
        color: "#222222",
        border: "1px solid #000000",
      },
    },
      secondaryButton: {
        normalStyle: {
          color: "#ffffff",
          backgroundColor: "#222222",
          border: "1px solid #222222",
          padding: padding || defaultPadding, // Use provided padding or default
          fontSize: fontSize || defaultFontSize, // Use provided font size or default
          fontWeight: "500",
          borderRadius: "8px",
          cursor: "pointer",
          transition: "background-color 200ms, color 200ms",
          width: width || defaultWidth, // Use provided width or default
        },
        hoverStyle: {
          backgroundColor: "#222222",
          color: "#ffffff",
          border: "1px solid #222222",
        },
      },
     
   
    
  };

  const { normalStyle, hoverStyle } = variants[variant];

  return (
    <button
      style={hover ? { ...normalStyle, ...hoverStyle } : normalStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {text}
    </button>
  );
};

export default ButtonPrimary;
