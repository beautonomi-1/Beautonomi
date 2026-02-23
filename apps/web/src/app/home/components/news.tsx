import { Button } from "@/components/ui/button";
import Image, { type StaticImageData } from "next/image";

type ImgSrc = StaticImageData | string;
import Image1 from './../../../../public/images/Group 7.svg';
import Image2 from './../../../../public/images/Group 2 (3).png';
import Image3 from './../../../../public/images/Frame 4.png';

export default function News() {
  return (
    <div className="px-10 py-6 bg-white mb-10">
      <h2 className="text-2xl md:text-[32px] font-normal mb-4">News for you 📰</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card
          title="Get a 15% service discount by inviting 10 friends!"
          image={Image1}
        />
        <Card
          title="Get Back Groove with a Renewed Sense of Beauty"
          image={Image2}
        />
        <Card
          title="The convenience of having service at your doorstep"
          image={Image3}
        />
      </div>
    </div>
  );
}

function Card({ title, image }: { title: string; image: ImgSrc }) {
  return (
    <div className="bg-pink-100 rounded-xl px-4 py-7 flex flex-col justify-between h-full">
      <div>
        <div className="flex justify-between items-center">
          <div>
          <h3 className="font-semibold text-lg md:text-xl mb-4 max-w-72">{title}</h3>
          <Button variant="secondary" size="rounded">
          Find your friends
        </Button>
        </div>
        <div>
          <Image src={image} alt={title}  className="mr-2 object-cover h-20 w-20" />
        </div>
        </div>
       
      </div>
    </div>
  );
}
