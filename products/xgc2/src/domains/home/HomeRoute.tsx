import type { HomeCardProps } from '../../shared/productWebComposition';
import { useProductWebComposition } from '../../shared/productWebComposition';
import '../../styles/home.css';

export function HomeRoute({ runtime }: HomeCardProps) {
  const composition = useProductWebComposition();
  if (!composition.home) {
    throw new Error('HomeRoute requires composition.home');
  }
  const cards = composition.home.cards;

  return (
    <div className="home-page xgc-workspace-full-span" data-xgc-role="home-page" data-xgc-id="home">
      <div className="home-gallery" data-xgc-role="home-card-gallery" data-xgc-id="home-card-gallery">
        {cards.map((card) => {
          const Card = card.component;
          return <Card key={card.id} runtime={runtime} />;
        })}
      </div>
    </div>
  );
}
