from pydantic import BaseModel, Field


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=200)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    pages: int

    @classmethod
    def create(cls, total: int, params: PageParams) -> PaginationMeta:
        pages = (total + params.page_size - 1) // params.page_size if total else 0
        return cls(page=params.page, page_size=params.page_size, total=total, pages=pages)
