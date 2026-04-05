import HomeMainClient from "./home-main-client";
import { fetchHomeInitial } from "./fetch-home-initial";
import { fetchPublicFooterInitial } from "./fetch-public-footer-initial";
import { HomePageStructuredData } from "./home/HomePageStructuredData";

export default async function HomeMarketplaceBody({
  categoryParam,
}: {
  categoryParam?: string;
}) {
  const [{ data, error }, footerInitial] = await Promise.all([
    fetchHomeInitial({ category: categoryParam }),
    fetchPublicFooterInitial(),
  ]);

  return (
    <>
      <HomePageStructuredData homeData={data} />
      <HomeMainClient
        initialHomeData={data}
        initialHomeError={error}
        initialFooter={footerInitial}
      />
    </>
  );
}
