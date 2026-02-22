import { DialogTitle, DialogHeader, DialogContent, Dialog, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { IoCopy } from "react-icons/io5";
import { FaWhatsappSquare, FaFacebookSquare } from "react-icons/fa";
import { FaSquareXTwitter } from "react-icons/fa6";
import { MdEmail } from "react-icons/md";
import { BiSolidMessageSquareDetail } from "react-icons/bi";
import g1 from "../../../../public/images/gg2.webp";

export default function Component() {
  return (
    <Dialog open>
      <DialogContent className="max-w-lg p-6 z-[9999]">
        <DialogHeader className="flex justify-start">
          <DialogTitle className="text-2xl font-normal mt-8">Share this experience</DialogTitle>
          <DialogDescription className="sr-only">
            Share this experience with others via various platforms
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-4 items-center my-4">
          <Image
            src={g1}
            alt="Experience"
            className="w-20 h-20 rounded-md"
            style={{ aspectRatio: "50/50", objectFit: "cover" }}
          />
          <p className="ml-4 text-lg font-light">Stay in Prince’s Purple Rain house</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Button variant="outline" className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl max-h-[50px]">
          <span className="text-lg"><IoCopy/></span>
            Copy Link
          </Button>
          <Button variant="outline" className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl max-h-[50px]">
          <span className="text-lg"><MdEmail/></span>
            Email
          </Button>
          <Button variant="outline" className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl max-h-[50px]">
          <span className="text-lg"><BiSolidMessageSquareDetail/></span>
            Messages
          </Button>
          <Button variant="outline" className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl max-h-[50px]">
          <span className="text-lg"><FaWhatsappSquare/></span>
            WhatsApp
          </Button>
          <Button variant="outline" className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl max-h-[50px]">
          <span className="text-lg"><FaFacebookSquare/></span>
            Facebook
          </Button>
          <Button variant="outline" className="flex items-center justify-start px-4 gap-4 font-light hover:bg-[#f7f7f7] rounded-xl max-h-[50px]">
          <span className="text-lg"><FaSquareXTwitter/></span>
            Twitter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}