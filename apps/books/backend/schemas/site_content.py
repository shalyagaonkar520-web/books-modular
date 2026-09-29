"""Editable public-website content (landing page copy and pricing).

One document holds the whole landing page. It is validated here so an operator
typo can never store something the site can't render, and every string is
length-capped. The page renders it as text (React escapes it), so no markup
from here is ever interpreted as HTML.
"""

from __future__ import annotations

from typing import Annotated, List, Literal

from pydantic import Field

from backend.schemas.common import APIModel

Line = Annotated[str, Field(max_length=120)]
MAX_PRICE = 10_000_000


class BrandContent(APIModel):
    badge: str = Field(default="", max_length=40)


class NavContent(APIModel):
    login_label: str = Field(min_length=1, max_length=40)
    cta_label: str = Field(min_length=1, max_length=60)


class HeroContent(APIModel):
    pill: str = Field(default="", max_length=200)
    pill_tag: str = Field(default="", max_length=40)
    title_line1: str = Field(min_length=1, max_length=200)
    title_highlight: str = Field(default="", max_length=200)
    subtitle: str = Field(default="", max_length=1000)
    primary_cta: str = Field(min_length=1, max_length=60)
    secondary_cta: str = Field(default="", max_length=60)
    trust_items: List[Line] = Field(default_factory=list, max_length=6)


class FeatureItem(APIModel):
    title: str = Field(min_length=1, max_length=80)
    text: str = Field(default="", max_length=300)


class FeaturesContent(APIModel):
    badge: str = Field(default="", max_length=60)
    title: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=500)
    items: List[FeatureItem] = Field(default_factory=list, max_length=18)


class PricingPlan(APIModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    monthly_price: float = Field(ge=0, le=MAX_PRICE)
    annual_price: float = Field(ge=0, le=MAX_PRICE)
    features: List[Line] = Field(default_factory=list, max_length=12)
    cta_label: str = Field(min_length=1, max_length=60)
    cta_target: Literal["register", "login"] = "register"
    popular: bool = False


class PricingContent(APIModel):
    badge: str = Field(default="", max_length=60)
    title: str = Field(default="", max_length=200)
    monthly_label: str = Field(default="Monthly", max_length=30)
    annual_label: str = Field(default="Annual", max_length=30)
    annual_discount_label: str = Field(default="", max_length=40)
    currency_symbol: str = Field(default="₹", max_length=5)
    period_label: str = Field(default="/month", max_length=20)
    popular_label: str = Field(default="MOST POPULAR", max_length=40)
    plans: List[PricingPlan] = Field(min_length=1, max_length=6)


class Testimonial(APIModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(default="", max_length=120)
    quote: str = Field(min_length=1, max_length=600)


class TestimonialsContent(APIModel):
    badge: str = Field(default="", max_length=60)
    title: str = Field(default="", max_length=200)
    items: List[Testimonial] = Field(default_factory=list, max_length=9)


class FaqItem(APIModel):
    question: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=1000)


class FaqContent(APIModel):
    badge: str = Field(default="", max_length=60)
    title: str = Field(default="", max_length=200)
    items: List[FaqItem] = Field(default_factory=list, max_length=20)


class CtaBannerContent(APIModel):
    title: str = Field(default="", max_length=200)
    subtitle: str = Field(default="", max_length=400)
    primary_cta: str = Field(min_length=1, max_length=60)
    secondary_cta: str = Field(default="", max_length=60)


class FooterColumn(APIModel):
    heading: str = Field(min_length=1, max_length=60)
    links: List[Annotated[str, Field(max_length=80)]] = Field(default_factory=list, max_length=8)


class FooterContent(APIModel):
    tagline: str = Field(default="", max_length=300)
    columns: List[FooterColumn] = Field(default_factory=list, max_length=4)
    copyright: str = Field(default="", max_length=200)
    bottom_note: str = Field(default="", max_length=200)


class SectionVisibility(APIModel):
    show_features: bool = True
    show_pricing: bool = True
    show_testimonials: bool = True
    show_faq: bool = True
    show_cta_banner: bool = True


class SiteContent(APIModel):
    brand: BrandContent
    nav: NavContent
    hero: HeroContent
    features: FeaturesContent
    pricing: PricingContent
    testimonials: TestimonialsContent
    faq: FaqContent
    cta_banner: CtaBannerContent
    footer: FooterContent
    sections: SectionVisibility = Field(default_factory=SectionVisibility)
